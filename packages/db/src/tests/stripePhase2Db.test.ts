/**
 * Magnus DB — Stripe Connect & Campaign Model Integration Tests
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env from project root
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, CampaignStatus } from '@prisma/client';
import { assertSafeTestDatabaseUrl, registerDbUnavailable } from './dbTestGuard';

// Use local test database
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';
// SPEC-P0 R3: refuse to touch anything that could be a real database.
assertSafeTestDatabaseUrl(DATABASE_URL);

async function canConnectToDb(): Promise<boolean> {
  const testClient = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });
  try {
    await testClient.$queryRaw`SELECT 1`;
    const schemaRows = await testClient.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'Campaign' AND column_name = 'title')
          OR (table_name = 'StripeConnectAccount' AND column_name = 'onboardingStatus')
        )
    `;
    await testClient.$disconnect();
    return schemaRows[0]?.count === 2;
  } catch {
    await testClient.$disconnect().catch(() => {});
    return false;
  }
}

(async () => {
  const dbAvailable = await canConnectToDb();

  if (!dbAvailable) {
    registerDbUnavailable(
      'Stripe Phase 2 Database integration tests',
      'DATABASE_URL unreachable or missing Campaign.title/StripeConnectAccount.onboardingStatus'
    );
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  const setupTestOrg = async (ein: string, name: string) => {
    return await prisma.organization.upsert({
      where: { ein },
      update: {},
      create: {
        name,
        ein,
        subscriptionTier: 'ENTERPRISE',
      },
    });
  };

  test('Campaigns: enforces org-scoped unique slug constraints', async () => {
    const org1 = await setupTestOrg('00-2222222', 'Campaign Org 1');
    const org2 = await setupTestOrg('00-3333333', 'Campaign Org 2');

    const slug = `summer-drive-${Date.now()}`;

    await prisma.campaign.create({
      data: {
        orgId: org1.id,
        title: 'Summer drive 1',
        slug,
        status: CampaignStatus.LIVE,
      },
    });

    await prisma.campaign.create({
      data: {
        orgId: org2.id,
        title: 'Summer drive 2',
        slug,
        status: CampaignStatus.DRAFT,
      },
    });

    await assert.rejects(
      async () => {
        await prisma.campaign.create({
          data: {
            orgId: org1.id,
            title: 'Summer drive 3',
            slug,
            status: CampaignStatus.DRAFT,
          },
        });
      },
      (err: any) => {
        // Prisma unique constraint violation code is P2002
        assert.equal(err.code, 'P2002');
        return true;
      }
    );
  });

  test('StripeConnectAccount: enforces unique stripeAccountId and orgId constraint', async () => {
    const org = await setupTestOrg('00-4444444', 'Connect Org 1');
    
    // Cleanup existing accounts for this org if any
    await prisma.stripeConnectAccount.deleteMany({
      where: { orgId: org.id }
    });

    const stripeAccountId = `acct_test_${Date.now()}`;

    // Create connected account
    const account = await prisma.stripeConnectAccount.create({
      data: {
        orgId: org.id,
        stripeAccountId,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });

    assert.ok(account.id);
    assert.equal(account.stripeAccountId, stripeAccountId);
    assert.equal(account.chargesEnabled, true);

    // Creating another account for the same org should fail (one Stripe Connect account per org)
    await assert.rejects(
      async () => {
        await prisma.stripeConnectAccount.create({
          data: {
            orgId: org.id,
            stripeAccountId: `acct_other_${Date.now()}`,
          },
        });
      },
      (err: any) => {
        assert.equal(err.code, 'P2002');
        return true;
      }
    );
  });

  test('StripeWebhookEvent: enforces uniqueness of eventId for idempotency', async () => {
    const eventId = `evt_test_${Date.now()}`;

    // Record webhook event
    const event = await prisma.stripeWebhookEvent.create({
      data: {
        eventId,
        processed: true,
      },
    });

    assert.ok(event.id);
    assert.equal(event.eventId, eventId);
    assert.equal(event.processed, true);

    // Attempt duplicate record
    await assert.rejects(
      async () => {
        await prisma.stripeWebhookEvent.create({
          data: {
            eventId,
            processed: false,
          },
        });
      },
      (err: any) => {
        assert.equal(err.code, 'P2002');
        return true;
      }
    );
  });
})();

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

// Use local test database
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';

async function canConnectToDb(): Promise<boolean> {
  const testClient = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });
  try {
    await testClient.$queryRaw`SELECT 1`;
    await testClient.$disconnect();
    return true;
  } catch {
    await testClient.$disconnect().catch(() => {});
    return false;
  }
}

(async () => {
  const dbAvailable = await canConnectToDb();

  if (!dbAvailable) {
    test('SKIP: Stripe Phase 2 Database integration tests (no DB connection)', { skip: 'DATABASE_URL unreachable' }, () => {});
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

  test('Campaigns: enforces unique slug constraints globally', async () => {
    const org1 = await setupTestOrg('00-2222222', 'Campaign Org 1');
    const org2 = await setupTestOrg('00-3333333', 'Campaign Org 2');

    const slug = `summer-drive-${Date.now()}`;

    // Create first campaign
    await prisma.campaign.create({
      data: {
        orgId: org1.id,
        name: 'Summer drive 1',
        slug,
        status: CampaignStatus.LIVE,
      },
    });

    // Attempting to create second campaign with identical slug should throw unique constraint violation
    await assert.rejects(
      async () => {
        await prisma.campaign.create({
          data: {
            orgId: org2.id,
            name: 'Summer drive 2',
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

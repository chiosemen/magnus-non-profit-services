/**
 * Magnus S4NP — Stripe Connect & Campaign Service Integration Tests
 */

// Load .env from project root dynamically at runtime to bypass ts compile checks
if (typeof require !== 'undefined') {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
  } catch (e) {}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, CampaignStatus } from '@magnus/db/types';
import {
  listCampaigns,
  getCampaignDetail,
  createCampaign,
  updateCampaign,
  publishCampaign,
  unpublishCampaign,
  createStripeOnboardingLink,
  getStripeAccountStatus,
  validateCampaignSlug,
} from '../stripeCampaignService';

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
    test('SKIP: S4NP service tests (no DB connection)', { skip: 'DATABASE_URL unreachable' }, () => {});
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

  test('Campaigns: slug validation reject rules', () => {
    // Valid slugs
    assert.equal(validateCampaignSlug('summer-drive-2026'), 'summer-drive-2026');
    assert.equal(validateCampaignSlug('campaign123'), 'campaign123');

    // Invalid slugs
    assert.throws(() => validateCampaignSlug('Summer Drive'), /lowercase/);
    assert.throws(() => validateCampaignSlug('summer--drive'), /lowercase/);
    assert.throws(() => validateCampaignSlug('-summer-drive'), /lowercase/);
    assert.throws(() => validateCampaignSlug('summer-drive-'), /lowercase/);
    assert.throws(() => validateCampaignSlug('summer$drive'), /lowercase/);
  });

  test('Campaigns: CRUD and Tenant Isolation', async () => {
    const orgA = await setupTestOrg('00-7777777', 'Org A');
    const orgB = await setupTestOrg('00-8888888', 'Org B');

    const slug = `autumn-drive-${Date.now()}`;

    // Create campaign for Org A
    const campaign = await createCampaign(prisma, orgA.id, {
      name: 'Autumn Drive',
      slug,
      goalAmount: 5000,
    });

    assert.ok(campaign.id);
    assert.equal(campaign.orgId, orgA.id);
    assert.equal(campaign.name, 'Autumn Drive');
    assert.equal(campaign.status, CampaignStatus.DRAFT);

    // List campaigns for Org A
    const listA = await listCampaigns(prisma, orgA.id);
    assert.ok(listA.some(c => c.id === campaign.id));

    // Org B should not see Org A campaign in list
    const listB = await listCampaigns(prisma, orgB.id);
    assert.ok(!listB.some(c => c.id === campaign.id));

    // Org B cannot access Org A campaign detail
    await assert.rejects(
      () => getCampaignDetail(prisma, orgB.id, campaign.id),
      (err: any) => {
        assert.equal(err.name, 'ForbiddenError');
        return true;
      }
    );

    // Org B cannot update Org A campaign
    await assert.rejects(
      () => updateCampaign(prisma, orgB.id, campaign.id, { name: 'Hack Name' }),
      (err: any) => {
        assert.equal(err.name, 'ForbiddenError');
        return true;
      }
    );

    // Org A can update its own campaign
    const updated = await updateCampaign(prisma, orgA.id, campaign.id, {
      name: 'Autumn Drive Updated',
      goalAmount: 6000,
    });
    assert.equal(updated.name, 'Autumn Drive Updated');
    assert.equal(Number(updated.goalAmount), 6000);
  });

  test('Campaigns: cannot publish without onboarding connected Stripe account', async () => {
    const org = await setupTestOrg('00-9999999', 'Publish Org');
    const slug = `publish-drive-${Date.now()}`;

    const campaign = await createCampaign(prisma, org.id, {
      name: 'Publish Campaign',
      slug,
    });

    // Cleanup any existing connected accounts for this test org
    await prisma.stripeConnectAccount.deleteMany({
      where: { orgId: org.id }
    });

    // Try to publish - should fail because no Stripe account exists
    await assert.rejects(
      () => publishCampaign(prisma, org.id, campaign.id),
      (err: any) => {
        assert.ok(err.message.includes('Stripe Connect account'));
        return true;
      }
    );

    // Create an un-onboarded Stripe account
    await prisma.stripeConnectAccount.create({
      data: {
        orgId: org.id,
        stripeAccountId: 'acct_unonboarded',
        chargesEnabled: false,
        payoutsEnabled: false,
      }
    });

    // Try to publish - should fail because charges are not enabled
    await assert.rejects(
      () => publishCampaign(prisma, org.id, campaign.id),
      (err: any) => {
        assert.ok(err.message.includes('payments enabled'));
        return true;
      }
    );

    // Update Stripe account to enable charges
    await prisma.stripeConnectAccount.update({
      where: { orgId: org.id },
      data: { chargesEnabled: true }
    });

    // Publish should succeed now
    const published = await publishCampaign(prisma, org.id, campaign.id);
    assert.equal(published.status, CampaignStatus.LIVE);

    // Unpublish campaign
    const unpublished = await unpublishCampaign(prisma, org.id, campaign.id);
    assert.equal(unpublished.status, CampaignStatus.DRAFT);
  });

  test('Stripe Connect: onboarding link and status polling handles env key check and mocks API', async () => {
    const org = await setupTestOrg('00-5555555', 'Stripe Org');
    
    // Clean up existing accounts for testing link creation from scratch
    await prisma.stripeConnectAccount.deleteMany({
      where: { orgId: org.id }
    });

    const mockLink = 'https://connect.stripe.com/onboard/abc';
    const prevFetch = globalThis.fetch;
    const prevEnv = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    globalThis.fetch = async (url, options) => {
      if (url === 'https://api.stripe.com/v1/accounts') {
        return {
          ok: true,
          json: async () => ({ id: 'acct_mock123' }),
        } as any;
      }
      if (url === 'https://api.stripe.com/v1/account_links') {
        return {
          ok: true,
          json: async () => ({ url: mockLink }),
        } as any;
      }
      if (url === 'https://api.stripe.com/v1/accounts/acct_mock123') {
        return {
          ok: true,
          json: async () => ({
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
          }),
        } as any;
      }
      return { ok: false } as any;
    };

    try {
      // 1. Create onboarding link
      const result = await createStripeOnboardingLink(prisma, org.id, 'http://return', 'http://refresh');
      assert.equal(result.url, mockLink);

      // Verify db account created
      let connectAccount = await prisma.stripeConnectAccount.findUnique({
        where: { orgId: org.id },
      });
      assert.ok(connectAccount);
      assert.equal(connectAccount.stripeAccountId, 'acct_mock123');
      assert.equal(connectAccount.chargesEnabled, false);

      // 2. Poll status and verify update
      const updatedAccount = await getStripeAccountStatus(prisma, org.id);
      assert.equal(updatedAccount.chargesEnabled, true);
      assert.equal(updatedAccount.payoutsEnabled, true);
      assert.equal(updatedAccount.detailsSubmitted, true);
    } finally {
      globalThis.fetch = prevFetch;
      process.env.STRIPE_SECRET_KEY = prevEnv;
    }
  });

  test('Stripe Connect: fails closed when organization context is missing', async () => {
    const prevEnv = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    try {
      await assert.rejects(
        () => createStripeOnboardingLink(prisma, '', 'http://return', 'http://refresh')
      );
      await assert.rejects(
        () => getStripeAccountStatus(prisma, '')
      );
    } finally {
      process.env.STRIPE_SECRET_KEY = prevEnv;
    }
  });
})();

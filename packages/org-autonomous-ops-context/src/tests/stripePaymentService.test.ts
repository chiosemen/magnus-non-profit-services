/**
 * Magnus S4NP — Stripe Connect checkout and Webhook processing integration tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { PrismaClient, CampaignStatus, DonationSource, ReceiptStatus } from '@magnus/db/types';
import {
  calculateFeeCoverage,
  getPublicCampaign,
  createDonationCheckoutSession,
  verifyStripeSignature,
  processWebhookEvent,
} from '../stripePaymentService';
import { canConnectToDb, DEFAULT_TEST_DATABASE_URL } from './testDb';

const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL;

(async () => {
  const dbAvailable = await canConnectToDb([{ table: 'Campaign', column: 'title' }]);

  if (!dbAvailable) {
    test(
      'SKIP: S4NP payment tests (no DB connection or Campaign.title schema mismatch)',
      { skip: 'DATABASE_URL unreachable or local schema lacks Campaign.title' },
      () => {},
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

  test('Payment Flow: fee coverage math calculations', () => {
    const res1 = calculateFeeCoverage(10.00);
    assert.equal(res1.grossAmount, 10.61);
    assert.equal(res1.feeCovered, 0.61);

    const res2 = calculateFeeCoverage(100.00);
    assert.equal(res2.grossAmount, 103.30);
    assert.equal(res2.feeCovered, 3.30);

    assert.throws(() => calculateFeeCoverage(-5.00), /positive/);
    assert.throws(() => calculateFeeCoverage(0), /positive/);
  });

  test('Payment Flow: public campaign lookup checks LIVE status', async () => {
    const org = await setupTestOrg('00-1122112', 'Lookup Org');
    const slugLive = `campaign-live-${Date.now()}`;
    const slugDraft = `campaign-draft-${Date.now()}`;

    await prisma.campaign.create({
      data: {
        orgId: org.id,
        title: 'Live campaign',
        slug: slugLive,
        status: CampaignStatus.LIVE,
      },
    });

    await prisma.campaign.create({
      data: {
        orgId: org.id,
        title: 'Draft campaign',
        slug: slugDraft,
        status: CampaignStatus.DRAFT,
      },
    });

    const res = await getPublicCampaign(prisma, slugLive);
    assert.equal(res.campaign.slug, slugLive);
    assert.equal(res.organizationName, 'Lookup Org');

    await assert.rejects(
      () => getPublicCampaign(prisma, slugDraft),
      (err: any) => {
        assert.ok(err.message.includes('not currently accepting'));
        return true;
      }
    );
  });

  test('Payment Flow: checkout creation validation checks', async () => {
    const org = await setupTestOrg('00-2233223', 'Checkout Val Org');
    const slug = `checkout-c1-${Date.now()}`;

    await prisma.campaign.create({
      data: {
        orgId: org.id,
        title: 'Checkout campaign',
        slug,
        status: CampaignStatus.LIVE,
      },
    });

    await prisma.stripeConnectAccount.deleteMany({
      where: { orgId: org.id },
    });

    await assert.rejects(
      () => createDonationCheckoutSession(prisma, slug, {
        amount: 25.00,
        donorEmail: 'donor@example.com',
        donorName: 'John Doe',
        coverFees: false,
        successUrl: 'http://success',
        cancelUrl: 'http://cancel',
      }),
      (err: any) => {
        assert.ok(err.message.includes('onboarding is incomplete'));
        return true;
      }
    );

    await prisma.stripeConnectAccount.create({
      data: {
        orgId: org.id,
        stripeAccountId: 'acct_checkout_test',
        chargesEnabled: false,
      },
    });

    await assert.rejects(
      () => createDonationCheckoutSession(prisma, slug, {
        amount: 25.00,
        donorEmail: 'donor@example.com',
        donorName: 'John Doe',
        coverFees: false,
        successUrl: 'http://success',
        cancelUrl: 'http://cancel',
      }),
      (err: any) => {
        assert.ok(err.message.includes('onboarding is incomplete'));
        return true;
      }
    );

    await prisma.stripeConnectAccount.update({
      where: { orgId: org.id },
      data: { onboardingStatus: 'ENABLED', chargesEnabled: true },
    });

    const prevFetch = globalThis.fetch;
    const prevEnv = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    const mockSessionId = `cs_mock_${Date.now()}`;
    const sessionUrl = `https://checkout.stripe.com/pay/${mockSessionId}`;
    globalThis.fetch = async (url, options) => {
      if (url === 'https://api.stripe.com/v1/checkout/sessions') {
        return {
          ok: true,
          json: async () => ({ id: mockSessionId, url: sessionUrl }),
        } as any;
      }
      return { ok: false } as any;
    };

    try {
      const sessionResult = await createDonationCheckoutSession(prisma, slug, {
        amount: 50.00,
        donorEmail: 'donor@example.com',
        donorName: 'Jane Doe',
        coverFees: true,
        successUrl: 'http://success',
        cancelUrl: 'http://cancel',
      });

      assert.equal(sessionResult.url, sessionUrl);
      assert.equal(sessionResult.stripeCheckoutSessionId, mockSessionId);

      const intent = await prisma.campaignDonationIntent.findUnique({
        where: { stripeCheckoutSessionId: mockSessionId },
      });
      assert.ok(intent);
      assert.equal(Number(intent.amount), 50.00);
      assert.equal(Number(intent.feeCovered), 1.80);
      assert.equal(intent.status, 'PENDING');
    } finally {
      globalThis.fetch = prevFetch;
      process.env.STRIPE_SECRET_KEY = prevEnv;
    }
  });

  test('Payment Flow: Stripe signature verification logic', () => {
    const rawBody = JSON.stringify({ id: 'evt_123', type: 'charge.succeeded' });
    const secret = 'whsec_test_signing_secret';
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const payload = `${timestamp}.${rawBody}`;
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signatureHeader = `t=${timestamp},v1=${hmac}`;

    assert.equal(verifyStripeSignature(rawBody, signatureHeader, secret), true);
    assert.equal(verifyStripeSignature(rawBody, signatureHeader + 'bad', secret), false);
    assert.equal(verifyStripeSignature(rawBody, signatureHeader, secret + 'bad'), false);
    assert.equal(verifyStripeSignature(rawBody, '', secret), false);
  });

  test('Payment Flow: Webhook transactional processing and Idempotency', async () => {
    const org = await setupTestOrg('00-4455445', 'Webhook Org');
    const campaign = await prisma.campaign.create({
      data: {
        orgId: org.id,
        title: 'Webhook Campaign',
        slug: `webhook-c-${Date.now()}`,
        status: CampaignStatus.LIVE,
      },
    });

    const sessionId = `cs_webhook_${Date.now()}`;
    const eventId = `evt_webhook_${Date.now()}`;
    const paymentIntentId = `pi_webhook_${Date.now()}`;

    await prisma.campaignDonationIntent.create({
      data: {
        orgId: org.id,
        campaignId: campaign.id,
        stripeCheckoutSessionId: sessionId,
        amount: 100.00,
        feeCovered: 3.30,
        donorEmail: 'donor_webhook@example.com',
        donorName: 'Webhook Donor',
        status: 'PENDING',
      },
    });

    const rawEvent = {
      id: eventId,
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: sessionId,
          currency: 'usd',
          amount_total: 10330,
          created: Math.floor(Date.now() / 1000),
          payment_intent: paymentIntentId,
          metadata: {
            orgId: org.id,
            campaignId: campaign.id,
            donorEmail: 'donor_webhook@example.com',
            donorName: 'Webhook Donor',
            netAmount: '100.00',
            feeCovered: '3.30',
          },
        },
      },
    };

    await prisma.stripeWebhookEvent.deleteMany({ where: { eventId } });
    await prisma.donation.deleteMany({ where: { stripeCheckoutSessionId: sessionId } });

    await processWebhookEvent(prisma, rawEvent);

    const donation = await prisma.donation.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
      include: { donor: true, receipt: true },
    });

    assert.ok(donation);
    assert.equal(Number(donation.amount), 100.00);
    assert.equal(Number(donation.feeCovered), 3.30);
    assert.equal(donation.stripePaymentIntentId, paymentIntentId);
    assert.equal(donation.source, DonationSource.STRIPE);
    assert.equal(donation.donor.email, 'donor_webhook@example.com');
    assert.equal(donation.receipt?.status, ReceiptStatus.DRAFT);

    const updatedIntent = await prisma.campaignDonationIntent.findFirst({
      where: { stripeCheckoutSessionId: sessionId },
    });
    assert.equal(updatedIntent?.status, 'COMPLETED');

    const initialDonationCount = await prisma.donation.count({
      where: { stripeCheckoutSessionId: sessionId },
    });
    assert.equal(initialDonationCount, 1);

    await processWebhookEvent(prisma, rawEvent);

    const postDonationCount = await prisma.donation.count({
      where: { stripeCheckoutSessionId: sessionId },
    });
    assert.equal(postDonationCount, 1);
  });
})();

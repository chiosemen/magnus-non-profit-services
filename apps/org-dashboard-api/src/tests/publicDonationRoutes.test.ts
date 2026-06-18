import test from 'node:test';
import assert from 'node:assert/strict';
import type { CampaignStatus } from '@magnus/db/types';
import { PAYMENT_PILOT_DISABLED_MESSAGE, StripeConnectNotReadyError } from '@magnus/org-autonomous-ops-context';
import { registerPublicDonationRoutes } from '../publicDonationRoutes';

type Handler = (req: any, res: any, next: (err?: unknown) => void) => any;

type PublicCampaignRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  goalAmount: { toString(): string } | null;
  currency: string;
  status: CampaignStatus;
};

function compose(chain: Handler[]): Handler {
  return async (req, res, next) => {
    let index = -1;
    const run = async (i: number, err?: unknown): Promise<void> => {
      if (err) {
        next(err);
        return;
      }
      if (i <= index) throw new Error('next_called_multiple_times');
      index = i;
      const fn = chain[i];
      if (!fn) return;
      let nextPromise: Promise<void> | null = null;
      await fn(req, res, (nextErr?: unknown) => {
        nextPromise = run(i + 1, nextErr);
      });
      if (nextPromise) await nextPromise;
    };
    await run(0);
  };
}

function createHarness() {
  const handlers = new Map<string, Handler>();
  const app: any = {
    get: (path: string, ...chain: Handler[]) => handlers.set(`GET ${path}`, compose(chain)),
    post: (path: string, ...chain: Handler[]) => handlers.set(`POST ${path}`, compose(chain)),
  };

  function response() {
    const res: any = {
      statusCode: 200,
      body: null as any,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: any) {
        res.body = payload;
        return res;
      },
    };
    return res;
  }

  return { app, handlers, response };
}

const passThroughRateLimit: Handler = (_req, _res, next) => next();

function publicCampaign(overrides: Partial<PublicCampaignRow> = {}) {
  return {
    id: 'campaign_1',
    title: 'Pilot Campaign',
    slug: 'pilot-campaign',
    description: 'Read-only campaign page',
    goalAmount: { toString: () => '5000' },
    currency: 'USD',
    status: 'LIVE' as CampaignStatus,
    ...overrides,
  };
}

test('public campaign payload exposes payment-gated status for pilot mode', async () => {
  const h = createHarness();
  registerPublicDonationRoutes(h.app, {
    db: {} as any,
    paymentsEnabled: () => false,
    rateLimitWrites: passThroughRateLimit as any,
    getPublicCampaign: async () => ({
      campaign: publicCampaign(),
      organizationName: 'Pilot Org',
    }),
  });

  const handler = h.handlers.get('GET /api/public/campaigns/:slug');
  assert.ok(handler);

  const res = h.response();
  await handler!({ params: { slug: 'pilot-campaign' } }, res, () => undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.organizationName, 'Pilot Org');
  assert.equal(res.body.paymentsEnabled, false);
});

test('checkout route returns safe 503 when payments are disabled for pilot mode', async () => {
  const h = createHarness();
  let called = false;

  registerPublicDonationRoutes(h.app, {
    db: {} as any,
    paymentsEnabled: () => false,
    rateLimitWrites: passThroughRateLimit as any,
    createDonationCheckoutSession: async () => {
      called = true;
      return { url: 'https://checkout.stripe.test/session', stripeCheckoutSessionId: 'cs_123' };
    },
  });

  const handler = h.handlers.get('POST /api/public/campaigns/:slug/checkout');
  assert.ok(handler);

  const res = h.response();
  await handler!(
    {
      params: { slug: 'pilot-campaign' },
      body: {
        amount: 25,
        donorEmail: 'donor@example.com',
        donorName: 'Pilot Donor',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      },
      ip: '127.0.0.1',
    },
    res,
    () => undefined,
  );

  assert.equal(called, false);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'PAYMENT_PROCESSING_NOT_ENABLED',
    message: PAYMENT_PILOT_DISABLED_MESSAGE,
  });
});

test('checkout route maps Stripe Connect not-ready states to 409 instead of 500', async () => {
  const h = createHarness();

  registerPublicDonationRoutes(h.app, {
    db: {} as any,
    paymentsEnabled: () => true,
    rateLimitWrites: passThroughRateLimit as any,
    createDonationCheckoutSession: async () => {
      throw new StripeConnectNotReadyError();
    },
  });

  const handler = h.handlers.get('POST /api/public/campaigns/:slug/checkout');
  assert.ok(handler);

  const res = h.response();
  await handler!(
    {
      params: { slug: 'pilot-campaign' },
      body: {
        amount: 25,
        donorEmail: 'donor@example.com',
        donorName: 'Pilot Donor',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      },
      ip: '127.0.0.1',
    },
    res,
    () => undefined,
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: 'STRIPE_CONNECT_NOT_READY',
    message: 'Organization payments onboarding is incomplete.',
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { registerStripeConnectRoutes } from '../stripeConnectRoutes';

type CapturedHandler = (req: any, res: any, next: (err?: unknown) => void) => Promise<any>;

function createHarness() {
  const handlers = new Map<string, CapturedHandler>();
  const app: any = {
    get: (path: string, _auth: any, handler: CapturedHandler) => {
      handlers.set(`GET ${path}`, handler);
    },
    post: (path: string, _auth: any, handler: CapturedHandler) => {
      handlers.set(`POST ${path}`, handler);
    },
  };

  function response() {
    const result: any = {
      statusCode: 200,
      body: null as any,
      status(code: number) {
        result.statusCode = code;
        return result;
      },
      json(payload: any) {
        result.body = payload;
        return result;
      },
    };
    return result;
  }

  return { app, handlers, response };
}

function createDb() {
  return {
    organization: {
      findUnique: async ({ where }: any) => ({ id: where.id, stripeAccountId: null }),
      update: async ({ where }: any) => ({ id: where.id }),
    },
    stripeConnectAccount: {
      findUnique: async ({ where }: any) => {
        if (where.orgId === 'org_enabled') {
          return {
            orgId: 'org_enabled',
            stripeAccountId: 'acct_1',
            onboardingStatus: 'ENABLED',
            detailsSubmitted: true,
            chargesEnabled: true,
            payoutsEnabled: true,
            requirementsCurrentlyDue: [],
            requirementsEventuallyDue: [],
            disabledReason: null,
            country: 'US',
            defaultCurrency: 'usd',
            onboardingLinkLastCreatedAt: null,
            onboardingLinkExpiresAt: null,
          };
        }
        return null;
      },
      upsert: async ({ create, update, where }: any) => ({
        orgId: where.orgId,
        stripeAccountId: update?.stripeAccountId ?? create.stripeAccountId,
        onboardingStatus: update?.onboardingStatus ?? create.onboardingStatus,
        detailsSubmitted: update?.detailsSubmitted ?? create.detailsSubmitted,
        chargesEnabled: update?.chargesEnabled ?? create.chargesEnabled,
        payoutsEnabled: update?.payoutsEnabled ?? create.payoutsEnabled,
        requirementsCurrentlyDue: update?.requirementsCurrentlyDue ?? create.requirementsCurrentlyDue,
        requirementsEventuallyDue: update?.requirementsEventuallyDue ?? create.requirementsEventuallyDue,
        disabledReason: update?.disabledReason ?? create.disabledReason,
        country: update?.country ?? create.country,
        defaultCurrency: update?.defaultCurrency ?? create.defaultCurrency,
        onboardingLinkLastCreatedAt: update?.onboardingLinkLastCreatedAt ?? create.onboardingLinkLastCreatedAt,
        onboardingLinkExpiresAt: update?.onboardingLinkExpiresAt ?? create.onboardingLinkExpiresAt,
      }),
    },
  };
}

function createGateway() {
  return {
    createAccount: async (orgId: string) => ({
      id: `acct_${orgId}`,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsCurrentlyDue: ['external_account'],
      requirementsEventuallyDue: [],
      disabledReason: null,
      country: 'US',
      defaultCurrency: 'usd',
    }),
    retrieveAccount: async (stripeAccountId: string) => ({
      id: stripeAccountId,
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsCurrentlyDue: ['external_account'],
      requirementsEventuallyDue: [],
      disabledReason: null,
      country: 'US',
      defaultCurrency: 'usd',
    }),
    createOnboardingLink: async ({ stripeAccountId }: any) => ({
      url: `https://connect.stripe.test/${stripeAccountId}`,
      expiresAt: new Date('2026-06-01T00:00:00.000Z'),
    }),
  };
}

test('status route returns 401 without auth org context', async () => {
  const h = createHarness();
  registerStripeConnectRoutes(h.app, (() => undefined) as any, {
    db: createDb() as any,
    gateway: createGateway() as any,
    returnUrl: 'https://app.test/return',
    refreshUrl: 'https://app.test/refresh',
  });

  const handler = h.handlers.get('GET /api/org/stripe-connect/status');
  assert.ok(handler);

  const res = h.response();
  await handler!({}, res, () => undefined);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'AUTH_INVALID' });
});

test('status route returns current org status payload', async () => {
  const h = createHarness();
  registerStripeConnectRoutes(h.app, (() => undefined) as any, {
    db: createDb() as any,
    gateway: createGateway() as any,
    returnUrl: 'https://app.test/return',
    refreshUrl: 'https://app.test/refresh',
  });

  const handler = h.handlers.get('GET /api/org/stripe-connect/status');
  assert.ok(handler);

  const res = h.response();
  await handler!({ auth: { orgId: 'org_enabled' } }, res, () => undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status.onboardingStatus, 'ENABLED');
  assert.equal(res.body.status.connected, true);
});

test('onboarding-link route returns 201 with onboarding URL', async () => {
  const h = createHarness();
  registerStripeConnectRoutes(h.app, (() => undefined) as any, {
    db: createDb() as any,
    gateway: createGateway() as any,
    returnUrl: 'https://app.test/return',
    refreshUrl: 'https://app.test/refresh',
  });

  const handler = h.handlers.get('POST /api/org/stripe-connect/onboarding-link');
  assert.ok(handler);

  const res = h.response();
  await handler!({ auth: { orgId: 'org_1' } }, res, () => undefined);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.onboarding.onboardingUrl, /^https:\/\/connect\.stripe\.test\//);
});


test('refresh route returns 404 when connect account does not exist', async () => {
  const h = createHarness();
  registerStripeConnectRoutes(h.app, (() => undefined) as any, {
    db: createDb() as any,
    gateway: createGateway() as any,
    returnUrl: 'https://app.test/return',
    refreshUrl: 'https://app.test/refresh',
  });

  const handler = h.handlers.get('POST /api/org/stripe-connect/onboarding-link/refresh');
  assert.ok(handler);

  const res = h.response();
  await handler!({ auth: { orgId: 'org_1' } }, res, () => undefined);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'STRIPE_CONNECT_NOT_FOUND' });
});

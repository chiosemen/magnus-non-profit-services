import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStripeConnectOnboardingLink,
  getStripeConnectStatus,
  refreshStripeConnectOnboardingLink,
  type StripeConnectGateway,
} from '../stripeConnectService';

type OrgRow = { id: string; stripeAccountId: string | null };
type ConnectRow = {
  orgId: string;
  stripeAccountId: string;
  onboardingStatus: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  disabledReason: string | null;
  country: string | null;
  defaultCurrency: string | null;
  onboardingLinkLastCreatedAt: Date | null;
  onboardingLinkExpiresAt: Date | null;
};

function createDb(orgs: OrgRow[], rows: ConnectRow[] = []) {
  const orgMap = new Map(orgs.map(o => [o.id, { ...o }]));
  const rowMap = new Map(rows.map(r => [r.orgId, { ...r }]));

  return {
    organization: {
      findUnique: async ({ where }: any) => {
        const row = orgMap.get(where.id);
        if (!row) return null;
        return { id: row.id, stripeAccountId: row.stripeAccountId };
      },
      update: async ({ where, data }: any) => {
        const row = orgMap.get(where.id);
        if (!row) throw new Error('ORG_NOT_FOUND');
        if (typeof data.stripeAccountId === 'string') row.stripeAccountId = data.stripeAccountId;
        return { id: row.id };
      },
    },
    stripeConnectAccount: {
      findUnique: async ({ where }: any) => {
        const row = rowMap.get(where.orgId);
        return row ? { ...row } : null;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = rowMap.get(where.orgId);
        if (!existing) {
          const row: ConnectRow = {
            orgId: create.orgId,
            stripeAccountId: create.stripeAccountId,
            onboardingStatus: create.onboardingStatus,
            detailsSubmitted: create.detailsSubmitted,
            chargesEnabled: create.chargesEnabled,
            payoutsEnabled: create.payoutsEnabled,
            requirementsCurrentlyDue: create.requirementsCurrentlyDue ?? [],
            requirementsEventuallyDue: create.requirementsEventuallyDue ?? [],
            disabledReason: create.disabledReason ?? null,
            country: create.country ?? null,
            defaultCurrency: create.defaultCurrency ?? null,
            onboardingLinkLastCreatedAt: create.onboardingLinkLastCreatedAt ?? null,
            onboardingLinkExpiresAt: create.onboardingLinkExpiresAt ?? null,
          };
          rowMap.set(where.orgId, row);
          return { ...row };
        }

        const row: ConnectRow = {
          ...existing,
          stripeAccountId: update.stripeAccountId,
          onboardingStatus: update.onboardingStatus,
          detailsSubmitted: update.detailsSubmitted,
          chargesEnabled: update.chargesEnabled,
          payoutsEnabled: update.payoutsEnabled,
          requirementsCurrentlyDue: update.requirementsCurrentlyDue ?? [],
          requirementsEventuallyDue: update.requirementsEventuallyDue ?? [],
          disabledReason: update.disabledReason ?? null,
          country: update.country ?? null,
          defaultCurrency: update.defaultCurrency ?? null,
          onboardingLinkLastCreatedAt: update.onboardingLinkLastCreatedAt ?? existing.onboardingLinkLastCreatedAt,
          onboardingLinkExpiresAt: update.onboardingLinkExpiresAt ?? existing.onboardingLinkExpiresAt,
        };
        rowMap.set(where.orgId, row);
        return { ...row };
      },
    },
    _state: {
      orgMap,
      rowMap,
    },
  };
}

function createGateway(overrides: Partial<StripeConnectGateway> = {}) {
  const calls = {
    createAccount: 0,
    retrieveAccount: 0,
    createOnboardingLink: 0,
  };

  const gateway: StripeConnectGateway = {
    createAccount: async (orgId: string) => {
      calls.createAccount += 1;
      return {
        id: `acct_${orgId}`,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsCurrentlyDue: ['external_account'],
        requirementsEventuallyDue: [],
        disabledReason: null,
        country: 'US',
        defaultCurrency: 'usd',
      };
    },
    retrieveAccount: async (stripeAccountId: string) => {
      calls.retrieveAccount += 1;
      return {
        id: stripeAccountId,
        detailsSubmitted: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        requirementsCurrentlyDue: [],
        requirementsEventuallyDue: [],
        disabledReason: null,
        country: 'US',
        defaultCurrency: 'usd',
      };
    },
    createOnboardingLink: async ({ stripeAccountId }) => {
      calls.createOnboardingLink += 1;
      return {
        url: `https://connect.stripe.test/${stripeAccountId}`,
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
      };
    },
    ...overrides,
  };

  return { gateway, calls };
}

test('status is disconnected when no StripeConnectAccount row exists', async () => {
  const db = createDb([{ id: 'org_1', stripeAccountId: null }]);

  const status = await getStripeConnectStatus(db as any, 'org_1');
  assert.equal(status.connected, false);
  assert.equal(status.onboardingStatus, null);
  assert.equal(status.stripeAccountId, null);
});

test('create onboarding link creates connect account when missing', async () => {
  const db = createDb([{ id: 'org_1', stripeAccountId: null }]);
  const { gateway, calls } = createGateway();

  const result = await createStripeConnectOnboardingLink(db as any, gateway, {
    orgId: 'org_1',
    returnUrl: 'https://app.test/app/donors/stripe-connect?state=return',
    refreshUrl: 'https://app.test/app/donors/stripe-connect?state=refresh',
  });

  assert.equal(calls.createAccount, 1);
  assert.equal(calls.retrieveAccount, 0);
  assert.equal(calls.createOnboardingLink, 1);
  assert.equal(result.connected, true);
  assert.equal(result.onboardingStatus, 'LINK_CREATED');
  assert.match(result.onboardingUrl, /connect\.stripe\.test/);

  const org = db._state.orgMap.get('org_1');
  assert.equal(org?.stripeAccountId, 'acct_org_1');
});

test('create onboarding link reuses existing StripeConnectAccount', async () => {
  const db = createDb(
    [{ id: 'org_1', stripeAccountId: 'acct_existing' }],
    [{
      orgId: 'org_1',
      stripeAccountId: 'acct_existing',
      onboardingStatus: 'IN_PROGRESS',
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirementsCurrentlyDue: ['external_account'],
      requirementsEventuallyDue: [],
      disabledReason: null,
      country: 'US',
      defaultCurrency: 'usd',
      onboardingLinkLastCreatedAt: null,
      onboardingLinkExpiresAt: null,
    }],
  );
  const { gateway, calls } = createGateway();

  const result = await createStripeConnectOnboardingLink(db as any, gateway, {
    orgId: 'org_1',
    returnUrl: 'https://app.test/app/donors/stripe-connect?state=return',
    refreshUrl: 'https://app.test/app/donors/stripe-connect?state=refresh',
  });

  assert.equal(calls.createAccount, 0);
  assert.equal(calls.retrieveAccount, 1);
  assert.equal(result.onboardingStatus, 'ENABLED');
});

test('refresh link fails when org has no connect account yet', async () => {
  const db = createDb([{ id: 'org_1', stripeAccountId: null }]);
  const { gateway } = createGateway();

  await assert.rejects(
    () => refreshStripeConnectOnboardingLink(db as any, gateway, {
      orgId: 'org_1',
      returnUrl: 'https://app.test/app/donors/stripe-connect?state=return',
      refreshUrl: 'https://app.test/app/donors/stripe-connect?state=refresh',
    }),
    /STRIPE_CONNECT_NOT_FOUND/,
  );
});

test('tenant scoping: org status only returns requested org row', async () => {
  const db = createDb(
    [
      { id: 'org_1', stripeAccountId: 'acct_1' },
      { id: 'org_2', stripeAccountId: 'acct_2' },
    ],
    [
      {
        orgId: 'org_1',
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
      },
      {
        orgId: 'org_2',
        stripeAccountId: 'acct_2',
        onboardingStatus: 'RESTRICTED',
        detailsSubmitted: true,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsCurrentlyDue: ['external_account'],
        requirementsEventuallyDue: [],
        disabledReason: 'requirements.past_due',
        country: 'US',
        defaultCurrency: 'usd',
        onboardingLinkLastCreatedAt: null,
        onboardingLinkExpiresAt: null,
      },
    ],
  );

  const status1 = await getStripeConnectStatus(db as any, 'org_1');
  const status2 = await getStripeConnectStatus(db as any, 'org_2');

  assert.equal(status1.onboardingStatus, 'ENABLED');
  assert.equal(status2.onboardingStatus, 'RESTRICTED');
  assert.equal(status1.stripeAccountId, 'acct_1');
  assert.equal(status2.stripeAccountId, 'acct_2');
});

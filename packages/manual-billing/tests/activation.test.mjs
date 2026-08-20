import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_PAYMENT_METHODS,
  assertPaymentMethodAllowed,
  assertTierAllowed,
  hashEntry,
  verifyChain,
} from '../src/auditChain.mjs';
import { activateOrg, deactivateOrg } from '../src/activateOrg.mjs';
import { createPendingOrg } from '../src/createOrg.mjs';
import { createMemoryStore } from '../src/memoryStore.mjs';

const baseOrg = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Helping Hands NPO',
  ein: '12-3456789',
  subscriptionTier: 'STARTER',
  subscriptionStatus: 'PENDING',
};

function baseInput(over = {}) {
  return {
    orgId: baseOrg.id,
    tier: 'STARTER',
    dealId: 'deal-001',
    amountMinor: 250000,
    currency: 'usd',
    paymentMethod: 'paypal_invoice',
    paymentReference: 'PAYPAL-TXN-1',
    operator: 'chinye@example.com',
    confirmedOrgName: 'Helping Hands NPO',
    ...over,
  };
}

test('ALLOWED_PAYMENT_METHODS excludes zelle (D3)', () => {
  assert.ok(!ALLOWED_PAYMENT_METHODS.includes('zelle'));
  assert.ok(!ALLOWED_PAYMENT_METHODS.includes('paypal'));
  assert.deepEqual(
    [...ALLOWED_PAYMENT_METHODS].sort(),
    ['paypal_invoice', 'stripe_payment_link'].sort()
  );
});

test('assertPaymentMethodAllowed refuses zelle', () => {
  assert.throws(() => assertPaymentMethodAllowed('zelle'), (e) => e.code === 'PAYMENT_METHOD_ZELLE_FORBIDDEN');
});

test('assertPaymentMethodAllowed refuses bare paypal (must be paypal_invoice)', () => {
  assert.throws(() => assertPaymentMethodAllowed('paypal'), (e) => e.code === 'PAYMENT_METHOD_NOT_ALLOWED');
  assert.throws(() => assertPaymentMethodAllowed('PayPal'), (e) => e.code === 'PAYMENT_METHOD_NOT_ALLOWED');
});

test('assertPaymentMethodAllowed accepts paypal_invoice and stripe_payment_link', () => {
  assert.equal(assertPaymentMethodAllowed('paypal_invoice'), 'paypal_invoice');
  assert.equal(assertPaymentMethodAllowed('stripe_payment_link'), 'stripe_payment_link');
});

test('GROWTH is hard-refused when staging gate file is absent (D2)', () => {
  assert.throws(
    () => assertTierAllowed('GROWTH', { existsSync: () => false }),
    (e) => e.code === 'GROWTH_HOLD_UNTIL_STAGING_VERIFIED'
  );
});

test('GROWTH is allowed when staging gate file exists', () => {
  assert.equal(assertTierAllowed('GROWTH', { existsSync: () => true }), 'GROWTH');
});

test('STARTER activate writes audit + ACTIVE in same transaction', async () => {
  const store = createMemoryStore([baseOrg]);
  const result = await activateOrg(store, baseInput(), { existsSync: () => false });
  assert.equal(result.outcome, 'applied');
  assert.equal(result.subscriptionStatus, 'ACTIVE');
  assert.equal(store.getOrg(baseOrg.id).subscriptionStatus, 'ACTIVE');
  assert.equal(store.getAudits().length, 1);
  assert.equal(store.getAudits()[0].amountMinor, 250000);
  assert.equal(store.getAudits()[0].sealed, true);
});

test('audit write failure rolls back entitlement change', async () => {
  const store = createMemoryStore([{ ...baseOrg }]);
  store.failNextAuditOnce();
  await assert.rejects(() => activateOrg(store, baseInput({ dealId: 'deal-fail' })), /AUDIT_WRITE_FAILED/);
  assert.equal(store.getOrg(baseOrg.id).subscriptionStatus, 'PENDING');
  assert.equal(store.getAudits().length, 0);
});

test('dealId is idempotent — second call is noop, no second grant', async () => {
  const store = createMemoryStore([{ ...baseOrg }]);
  const first = await activateOrg(store, baseInput({ dealId: 'deal-idem' }));
  assert.equal(first.outcome, 'applied');
  // mutate status to prove second call does not re-apply
  store.getOrg(baseOrg.id).subscriptionStatus = 'CANCELED';
  const second = await activateOrg(store, baseInput({ dealId: 'deal-idem', amountMinor: 999 }));
  assert.equal(second.outcome, 'noop_idempotent');
  assert.equal(store.getAudits().length, 1);
  assert.equal(store.getOrg(baseOrg.id).subscriptionStatus, 'CANCELED');
});

test('typed org name confirmation required — y/N is not enough', async () => {
  const store = createMemoryStore([{ ...baseOrg }]);
  await assert.rejects(
    () => activateOrg(store, baseInput({ confirmedOrgName: 'y' })),
    (e) => e.code === 'ORG_NAME_CONFIRMATION_MISMATCH'
  );
  await assert.rejects(
    () => activateOrg(store, baseInput({ confirmedOrgName: 'Wrong Name' })),
    (e) => e.code === 'ORG_NAME_CONFIRMATION_MISMATCH'
  );
});

test('missing evidence fields are refused', async () => {
  const store = createMemoryStore([{ ...baseOrg }]);
  await assert.rejects(
    () => activateOrg(store, baseInput({ paymentReference: '' })),
    (e) => e.code === 'MISSING_FIELD'
  );
  await assert.rejects(
    () => activateOrg(store, baseInput({ operator: '  ' })),
    (e) => e.code === 'MISSING_FIELD'
  );
});

test('activate with amountMinor 0 is refused; deactivate forces 0', async () => {
  const store = createMemoryStore([{ ...baseOrg, subscriptionStatus: 'ACTIVE' }]);
  await assert.rejects(
    () => activateOrg(store, baseInput({ amountMinor: 0, dealId: 'deal-zero' })),
    (e) => e.code === 'AMOUNT_MINOR_MUST_BE_POSITIVE_FOR_ACTIVATE'
  );
  const result = await deactivateOrg(
    store,
    baseInput({ dealId: 'deal-deact', amountMinor: 99999 }),
    { existsSync: () => false }
  );
  assert.equal(result.outcome, 'applied');
  assert.equal(result.amountMinor, 0);
  assert.equal(store.getAudits()[0].amountMinor, 0);
  assert.equal(store.getOrg(baseOrg.id).subscriptionStatus, 'CANCELED');
});

test('GROWTH activate refused without gate even when other fields valid', async () => {
  const store = createMemoryStore([{ ...baseOrg }]);
  await assert.rejects(
    () => activateOrg(store, baseInput({ tier: 'GROWTH', dealId: 'deal-growth' }), { existsSync: () => false }),
    (e) => e.code === 'GROWTH_HOLD_UNTIL_STAGING_VERIFIED'
  );
  assert.equal(store.getAudits().length, 0);
});

test('hash chain verifies for sequential activations', async () => {
  const store = createMemoryStore([
    { ...baseOrg },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Second Org',
      ein: '98-7654321',
      subscriptionTier: 'STARTER',
      subscriptionStatus: 'PENDING',
    },
  ]);
  await activateOrg(store, baseInput({ dealId: 'd1' }), { existsSync: () => false });
  await activateOrg(
    store,
    baseInput({
      dealId: 'd2',
      orgId: '22222222-2222-2222-2222-222222222222',
      confirmedOrgName: 'Second Org',
      paymentReference: 'PAYPAL-2',
    }),
    { existsSync: () => false }
  );
  const rows = store.getAudits().map((a) => ({
    entryHash: a.entryHash,
    prevHash: a.prevHash,
    payload: {
      dealId: a.dealId,
      orgId: a.orgId,
      action: a.action,
      tier: a.tier,
      amountMinor: a.amountMinor,
      currency: a.currency,
      paymentMethod: a.paymentMethod,
      paymentReference: a.paymentReference,
      operator: a.operator,
      orgName: a.orgName,
      prevHash: a.prevHash,
      createdAt: a.createdAt.toISOString(),
    },
  }));
  assert.equal(verifyChain(rows).ok, true);
  // Tamper
  rows[1].entryHash = 'deadbeef';
  assert.equal(verifyChain(rows).ok, false);
});

test('hashEntry is deterministic for identical payloads', () => {
  const payload = {
    dealId: 'x',
    orgId: 'o',
    action: 'ACTIVATE',
    tier: 'STARTER',
    amountMinor: 100,
    currency: 'USD',
    paymentMethod: 'paypal_invoice',
    paymentReference: 'r',
    operator: 'op',
    orgName: 'N',
    prevHash: null,
    createdAt: '2026-08-20T00:00:00.000Z',
  };
  assert.equal(hashEntry(payload), hashEntry({ ...payload }));
});

test('createPendingOrg creates PENDING and refuses EIN collision', async () => {
  const store = createMemoryStore([]);
  const org = await createPendingOrg(store, {
    name: 'New Org',
    ein: '11-1111111',
    subscriptionTier: 'STARTER',
  });
  assert.equal(org.subscriptionStatus, 'PENDING');
  await assert.rejects(
    () => createPendingOrg(store, { name: 'Other', ein: '11-1111111' }),
    (e) => e.code === 'ORG_EIN_CONFLICT'
  );
});

test('non-integer amountMinor refused', async () => {
  const store = createMemoryStore([{ ...baseOrg }]);
  await assert.rejects(
    () => activateOrg(store, baseInput({ amountMinor: 12.34, dealId: 'deal-float' })),
    (e) => e.code === 'AMOUNT_MINOR_INVALID'
  );
});

test('unknown payment method refused', () => {
  assert.throws(() => assertPaymentMethodAllowed('venmo'), (e) => e.code === 'PAYMENT_METHOD_NOT_ALLOWED');
});

test('ORG_NOT_FOUND when id missing', async () => {
  const store = createMemoryStore([]);
  await assert.rejects(
    () => activateOrg(store, baseInput({ orgId: '00000000-0000-0000-0000-000000000000' })),
    (e) => e.code === 'ORG_NOT_FOUND'
  );
});

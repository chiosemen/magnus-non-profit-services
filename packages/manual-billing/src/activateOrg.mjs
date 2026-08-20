/**
 * Core activate / deactivate logic. Store is injected — no Prisma import here.
 *
 * Invariants:
 * - Entitlement change and audit row commit in the same transaction.
 * - dealId is the idempotency key; repeats are reported no-ops.
 * - GROWTH refused until staging gate file exists (D2).
 * - Deactivation records amountMinor: 0.
 */
import {
  assertPaymentMethodAllowed,
  assertTierAllowed,
  hashEntry,
} from './auditChain.mjs';

/**
 * @typedef {object} ActivateInput
 * @property {string} orgId
 * @property {string} tier
 * @property {string} dealId
 * @property {number} amountMinor
 * @property {string} currency
 * @property {string} paymentMethod
 * @property {string} paymentReference
 * @property {string} operator
 * @property {string} confirmedOrgName  typed confirmation — must equal org.name
 * @property {'ACTIVATE'|'DEACTIVATE'} [action]
 */

/**
 * @typedef {object} BillingStore
 * @property {(fn: (tx: any) => Promise<any>) => Promise<any>} transaction
 * @property {(tx: any, orgId: string) => Promise<{ id: string, name: string, subscriptionTier: string, subscriptionStatus: string }|null>} findOrg
 * @property {(tx: any, dealId: string) => Promise<{ dealId: string, action: string, orgId: string }|null>} findAuditByDealId
 * @property {(tx: any) => Promise<string|null>} latestEntryHash
 * @property {(tx: any, row: object) => Promise<object>} insertAudit
 * @property {(tx: any, orgId: string, data: { subscriptionTier: string, subscriptionStatus: string }) => Promise<void>} updateOrgEntitlement
 */

function requireFields(input) {
  const required = [
    'orgId',
    'tier',
    'dealId',
    'currency',
    'paymentMethod',
    'paymentReference',
    'operator',
    'confirmedOrgName',
  ];
  for (const k of required) {
    if (input[k] == null || String(input[k]).trim() === '') {
      const err = new Error(`MISSING_FIELD:${k}`);
      err.code = 'MISSING_FIELD';
      throw err;
    }
  }
  if (input.action !== 'DEACTIVATE') {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
      const err = new Error('AMOUNT_MINOR_INVALID');
      err.code = 'AMOUNT_MINOR_INVALID';
      throw err;
    }
  }
}

/**
 * @param {BillingStore} store
 * @param {ActivateInput} input
 * @param {{ existsSync?: (p: string) => boolean, gatePath?: string, now?: () => Date }} [opts]
 */
export async function activateOrg(store, input, opts = {}) {
  requireFields(input);
  const action = input.action === 'DEACTIVATE' ? 'DEACTIVATE' : 'ACTIVATE';
  const paymentMethod = assertPaymentMethodAllowed(input.paymentMethod);
  const tier = assertTierAllowed(input.tier, {
    existsSync: opts.existsSync,
    gatePath: opts.gatePath,
  });

  const amountMinor = action === 'DEACTIVATE' ? 0 : input.amountMinor;
  if (action === 'ACTIVATE' && amountMinor <= 0) {
    const err = new Error('AMOUNT_MINOR_MUST_BE_POSITIVE_FOR_ACTIVATE');
    err.code = 'AMOUNT_MINOR_MUST_BE_POSITIVE_FOR_ACTIVATE';
    throw err;
  }

  return store.transaction(async (tx) => {
    const existing = await store.findAuditByDealId(tx, input.dealId);
    if (existing) {
      return {
        outcome: 'noop_idempotent',
        dealId: existing.dealId,
        orgId: existing.orgId,
        action: existing.action,
      };
    }

    const org = await store.findOrg(tx, input.orgId);
    if (!org) {
      const err = new Error('ORG_NOT_FOUND');
      err.code = 'ORG_NOT_FOUND';
      throw err;
    }
    if (org.name !== input.confirmedOrgName) {
      const err = new Error('ORG_NAME_CONFIRMATION_MISMATCH');
      err.code = 'ORG_NAME_CONFIRMATION_MISMATCH';
      throw err;
    }

    const prevHash = await store.latestEntryHash(tx);
    const createdAt = (opts.now ? opts.now() : new Date()).toISOString();
    const payload = {
      dealId: input.dealId,
      orgId: org.id,
      action,
      tier,
      amountMinor,
      currency: String(input.currency).toUpperCase(),
      paymentMethod,
      paymentReference: String(input.paymentReference).trim(),
      operator: String(input.operator).trim(),
      orgName: org.name,
      prevHash: prevHash ?? null,
      createdAt,
    };
    const entryHash = hashEntry(payload);

    // Audit first inside the same transaction — if this throws, entitlement must not change.
    await store.insertAudit(tx, {
      dealId: payload.dealId,
      orgId: payload.orgId,
      action: payload.action,
      tier: payload.tier,
      amountMinor: payload.amountMinor,
      currency: payload.currency,
      paymentMethod: payload.paymentMethod,
      paymentReference: payload.paymentReference,
      operator: payload.operator,
      orgName: payload.orgName,
      prevHash: payload.prevHash,
      entryHash,
      sealed: true,
      createdAt: new Date(createdAt),
    });

    const subscriptionStatus = action === 'ACTIVATE' ? 'ACTIVE' : 'CANCELED';
    await store.updateOrgEntitlement(tx, org.id, {
      subscriptionTier: tier,
      subscriptionStatus,
    });

    return {
      outcome: 'applied',
      dealId: payload.dealId,
      orgId: org.id,
      action,
      tier,
      subscriptionStatus,
      entryHash,
      amountMinor,
    };
  });
}

export async function deactivateOrg(store, input, opts = {}) {
  return activateOrg(
    store,
    {
      ...input,
      action: 'DEACTIVATE',
      amountMinor: 0,
    },
    opts
  );
}

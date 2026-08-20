/**
 * Hash-chained append-only billing audit helpers.
 * Sealed rows must verify against prevHash; verifyChain walks the full chain.
 */
import { createHash } from 'node:crypto';
import { existsSync as defaultExistsSync } from 'node:fs';
/**
 * @typedef {object} AuditPayload
 * @property {string} dealId
 * @property {string} orgId
 * @property {'ACTIVATE'|'DEACTIVATE'} action
 * @property {string} tier
 * @property {number} amountMinor
 * @property {string} currency
 * @property {string} paymentMethod
 * @property {string} paymentReference
 * @property {string} operator
 * @property {string} orgName
 * @property {string} [prevHash]
 * @property {string} [createdAt]
 */

/**
 * Canonical JSON for hashing — sorted keys, no whitespace variance.
 * @param {Record<string, unknown>} obj
 */
export function canonicalJson(obj) {
  const keys = Object.keys(obj).sort();
  /** @type {Record<string, unknown>} */
  const sorted = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

/**
 * @param {AuditPayload} payload
 * @returns {string} hex sha256
 */
export function hashEntry(payload) {
  const material = canonicalJson({
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
    prevHash: payload.prevHash ?? null,
    createdAt: payload.createdAt ?? null,
  });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * @param {Array<{ entryHash: string, prevHash: string|null, payload: AuditPayload }>} rows
 *   rows must be in chain order (oldest first). payload should match what was hashed.
 */
export function verifyChain(rows) {
  let expectedPrev = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if ((row.prevHash ?? null) !== expectedPrev) {
      return {
        ok: false,
        index: i,
        reason: `prevHash mismatch at index ${i}: expected ${expectedPrev}, got ${row.prevHash}`,
      };
    }
    const recomputed = hashEntry({ ...row.payload, prevHash: row.prevHash ?? undefined });
    if (recomputed !== row.entryHash) {
      return {
        ok: false,
        index: i,
        reason: `entryHash mismatch at index ${i}`,
      };
    }
    expectedPrev = row.entryHash;
  }
  return { ok: true };
}

/** Payment methods allowed at launch (D3). Zelle is explicitly excluded. */
export const ALLOWED_PAYMENT_METHODS = Object.freeze(['paypal', 'stripe_payment_link']);

/**
 * @param {string} method
 */
export function assertPaymentMethodAllowed(method) {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === 'zelle') {
    const err = new Error('PAYMENT_METHOD_ZELLE_FORBIDDEN');
    err.code = 'PAYMENT_METHOD_ZELLE_FORBIDDEN';
    throw err;
  }
  if (!ALLOWED_PAYMENT_METHODS.includes(normalized)) {
    const err = new Error(`PAYMENT_METHOD_NOT_ALLOWED:${normalized}`);
    err.code = 'PAYMENT_METHOD_NOT_ALLOWED';
    throw err;
  }
  return normalized;
}

/**
 * D2 — GROWTH is hard-refused until staging verification gate file exists.
 * @param {string} tier
 * @param {{ existsSync?: (p: string) => boolean, gatePath?: string }} [fsLike]
 */
export function assertTierAllowed(tier, fsLike = {}) {
  const t = String(tier || '').trim().toUpperCase();
  if (!['STARTER', 'GROWTH', 'ENTERPRISE'].includes(t)) {
    const err = new Error(`TIER_INVALID:${t}`);
    err.code = 'TIER_INVALID';
    throw err;
  }
  if (t === 'GROWTH') {
    const gatePath = fsLike.gatePath || 'docs/releases/p0-staging-verified.md';
    const existsSync = fsLike.existsSync || defaultExistsSync;
    if (!existsSync(gatePath)) {
      const err = new Error('GROWTH_HOLD_UNTIL_STAGING_VERIFIED');
      err.code = 'GROWTH_HOLD_UNTIL_STAGING_VERIFIED';
      throw err;
    }
  }
  return t;
}

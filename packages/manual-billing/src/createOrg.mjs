/**
 * Operator org creation — PENDING only. Activation is a separate audited step.
 */

/**
 * @typedef {object} CreateOrgStore
 * @property {(fn: (tx: any) => Promise<any>) => Promise<any>} transaction
 * @property {(tx: any, ein: string) => Promise<{ id: string }|null>} findOrgByEin
 * @property {(tx: any, params: { name: string, ein: string, subscriptionTier: string }) => Promise<object>} createOrganization
 */

/**
 * @param {CreateOrgStore} store
 * @param {{ name: string, ein: string, subscriptionTier?: string }} input
 */
export async function createPendingOrg(store, input) {
  const name = String(input.name || '').trim();
  const ein = String(input.ein || '').trim();
  const subscriptionTier = String(input.subscriptionTier || 'STARTER').trim().toUpperCase();

  if (!name || !ein) {
    const err = new Error('MISSING_ORG_NAME_OR_EIN');
    err.code = 'MISSING_ORG_NAME_OR_EIN';
    throw err;
  }
  if (!['STARTER', 'GROWTH', 'ENTERPRISE'].includes(subscriptionTier)) {
    const err = new Error(`TIER_INVALID:${subscriptionTier}`);
    err.code = 'TIER_INVALID';
    throw err;
  }

  return store.transaction(async (tx) => {
    const hit = await store.findOrgByEin(tx, ein);
    if (hit) {
      const err = new Error('ORG_EIN_CONFLICT');
      err.code = 'ORG_EIN_CONFLICT';
      throw err;
    }
    return store.createOrganization(tx, {
      name,
      ein,
      subscriptionTier,
    });
  });
}

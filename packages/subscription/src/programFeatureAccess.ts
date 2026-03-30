import type { FeatureKey } from './features';

/** Accepts Prisma client or extended client from @magnus/db (structural typing differs). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

/**
 * Institutional partner programs may whitelist FeatureKey values for managed orgs.
 * The billing-org capability `institutional_partner` is never granted via programs—only via ENTERPRISE tier on the partner billing organization.
 */
export async function hasInstitutionalProgramFeature(
  db: DbClient,
  orgId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  if (featureKey === 'institutional_partner') return false;

  const row = await db.partnerOrgMembership.findFirst({
    where: {
      orgId,
      isActive: true,
      programId: { not: null },
      program: {
        isActive: true,
        enabledFeatures: { has: featureKey },
      },
    },
    select: { id: true },
  });
  return row != null;
}

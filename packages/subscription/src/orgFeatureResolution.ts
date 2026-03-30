import type { FeatureKey } from './features';
import { FeatureNotEnabledError } from './errors';
import { isFeatureEnabled } from './policy';
import { hasInstitutionalProgramFeature } from './programFeatureAccess';

/** Accepts Prisma client or extended client from @magnus/db (structural typing differs). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

/**
 * Tier-based access first; if denied and org subscription is ACTIVE, allow features
 * whitelisted on an active PartnerProgram via active PartnerOrgMembership.
 */
export async function assertOrgFeatureAllowed(
  db: DbClient,
  orgId: string,
  featureKey: FeatureKey
): Promise<void> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { subscriptionTier: true, subscriptionStatus: true },
  });
  if (!org) throw new Error('ORG_NOT_FOUND');

  if (isFeatureEnabled({ tier: org.subscriptionTier, status: org.subscriptionStatus, featureKey })) {
    return;
  }

  if (org.subscriptionStatus !== 'ACTIVE') {
    throw new FeatureNotEnabledError({
      orgId,
      featureKey,
      message: `Feature ${featureKey} is not enabled for tier ${org.subscriptionTier} (${org.subscriptionStatus}).`,
    });
  }

  if (await hasInstitutionalProgramFeature(db, orgId, featureKey)) {
    return;
  }

  throw new FeatureNotEnabledError({
    orgId,
    featureKey,
    message: `Feature ${featureKey} is not enabled for tier ${org.subscriptionTier} (${org.subscriptionStatus}).`,
  });
}

import { prisma } from '@magnus/db/client';
import type { SubscriptionTier } from '@magnus/db/types';
import type { FeatureKey } from './features';
import { requireFeature } from './middleware/requireFeature';
import { assertOrgFeatureAllowed } from './orgFeatureResolution';

export type { FeatureKey } from './features';
export { FeatureNotEnabledError } from './errors';
export { AuthRequiredError, InvalidTokenError, SubscriptionNotActiveError } from './errors';
export { featuresForTier, isFeatureEnabled } from './policy';
export { requireFeature } from './middleware/requireFeature';
export { hasInstitutionalProgramFeature } from './programFeatureAccess';
export { assertOrgFeatureAllowed } from './orgFeatureResolution';
export {
  PROGRAM_ENABLED_FEATURE_KEYS,
  parseProgramEnabledFeatures,
  ProgramFeatureParseError,
} from './programFeatures';

export async function getOrgTier(orgId: string): Promise<SubscriptionTier> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { subscriptionTier: true },
  });
  if (!org) throw new Error('ORG_NOT_FOUND');
  return org.subscriptionTier;
}

export async function enforceFeature(orgId: string, featureKey: FeatureKey): Promise<void> {
  await assertOrgFeatureAllowed(prisma, orgId, featureKey);
}

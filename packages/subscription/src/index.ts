import { prisma } from '@magnus/db/client';
import type { SubscriptionTier } from '@magnus/db/types';
import type { FeatureKey } from './features';
import { FeatureNotEnabledError } from './errors';
import { featuresForTier, isFeatureEnabled } from './policy';
import { requireFeature } from './middleware/requireFeature';

export type { FeatureKey } from './features';
export { FeatureNotEnabledError } from './errors';
export { AuthRequiredError, InvalidTokenError, SubscriptionNotActiveError } from './errors';
export { featuresForTier, isFeatureEnabled } from './policy';
export { subscriptionAllowsScheduledAgent } from './autonomousOpsPolicy';
export type { ScheduledAgentName } from './autonomousOpsPolicy';
export { requireFeature } from './middleware/requireFeature';

export async function getOrgTier(orgId: string): Promise<SubscriptionTier> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { subscriptionTier: true },
  });
  if (!org) throw new Error('ORG_NOT_FOUND');
  return org.subscriptionTier;
}

export async function enforceFeature(orgId: string, featureKey: FeatureKey): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { subscriptionTier: true, subscriptionStatus: true },
  });
  if (!org) throw new Error('ORG_NOT_FOUND');

  if (!isFeatureEnabled({ tier: org.subscriptionTier, status: org.subscriptionStatus, featureKey })) {
    throw new FeatureNotEnabledError({
      orgId,
      featureKey,
      message: `Feature ${featureKey} is not enabled for tier ${org.subscriptionTier} (${org.subscriptionStatus}).`,
    });
  }
}

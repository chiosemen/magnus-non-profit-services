import type { FeatureKey } from './features';
import type { SubscriptionTier, SubscriptionStatus } from '@magnus/db/types';

export function featuresForTier(tier: SubscriptionTier): ReadonlySet<FeatureKey> {
  if (tier === 'STARTER') return new Set(['compliance_calendar']);
  if (tier === 'GROWTH') return new Set(['compliance_calendar', 'grant_generator']);
  // ENTERPRISE: full OS + institutional channel primitives (billing org on partner record)
  return new Set([
    'compliance_calendar',
    'grant_generator',
    'claude_partner',
    'worker_financial_layer',
    'agents_layer',
    'institutional_partner',
  ]);
}

export function isFeatureEnabled(params: {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  featureKey: FeatureKey;
}): boolean {
  if (params.status !== 'ACTIVE') return false;
  return featuresForTier(params.tier).has(params.featureKey);
}


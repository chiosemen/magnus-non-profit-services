import type { FeatureKey } from './features';
import type { SubscriptionTier, SubscriptionStatus } from '@magnus/db/types';

export function featuresForTier(tier: SubscriptionTier): ReadonlySet<FeatureKey> {
  if (tier === 'STARTER') return new Set(['compliance_calendar']);
  if (tier === 'GROWTH')
    return new Set([
      'compliance_calendar',
      'grant_generator',
      'restricted_funds',
      'donor_operations',
      'volunteer_operations',
    ]);
  // ENTERPRISE: full OS + institutional channel + executive rollups
  return new Set([
    'compliance_calendar',
    'grant_generator',
    'restricted_funds',
    'claude_partner',
    'worker_financial_layer',
    'agents_layer',
    'institutional_partner',
    'donor_operations',
    'volunteer_operations',
    'executive_rollups',
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


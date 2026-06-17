import type { FeatureKey } from './features';
import type { SubscriptionTier, SubscriptionStatus } from '@magnus/db/types';

export function featuresForTier(tier: SubscriptionTier): ReadonlySet<FeatureKey> {
  if (tier === 'STARTER') {
    return new Set([
      'donor_crm',
      'campaigns',
      'compliance_calendar',
    ]);
  }
  if (tier === 'GROWTH')
    return new Set([
      'donor_crm',
      'campaigns',
      'stripe_connect_campaigns',
      'fund_accounting_lite',
      'ai_concierge',
      'board_packets',
      'compliance_reminders',
      'compliance_calendar',
      'grant_generator',
      'autonomous_ops_assisted',
    ]);
  // ENTERPRISE: full OS + autonomous ops standard + institutional flag (product packaging)
  return new Set([
    'donor_crm',
    'campaigns',
    'stripe_connect_campaigns',
    'fund_accounting_lite',
    'ai_concierge',
    'board_packets',
    'compliance_reminders',
    'compliance_calendar',
    'grant_generator',
    'claude_partner',
    'agents_layer',
    'autonomous_ops_assisted',
    'autonomous_ops_standard',
    'autonomous_ops_institutional',
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

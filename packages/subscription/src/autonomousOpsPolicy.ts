import type { SubscriptionStatus, SubscriptionTier } from '@magnus/db/types';

/** Stable names persisted on `AgentRun` / alerts (roadmap personas map in docs). */
export type ScheduledAgentName =
  | 'ComplianceWatchdog'
  | 'BoardIntelligenceOracle'
  | 'GrantLifecycleManager'
  | 'GrantIntelligenceHerald'
  | 'FinancialSentinel'
  | 'WorkerIncomeOptimizer';

/**
 * Which agents may run on the scheduler for this org, given subscription only.
 * Fail-closed: unknown agent names return false.
 */
export function subscriptionAllowsScheduledAgent(params: {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  agentName: string;
}): boolean {
  if (params.status !== 'ACTIVE') return false;
  const { tier } = params;
  if (tier === 'STARTER') return false;

  const name = params.agentName as ScheduledAgentName;

  if (name === 'ComplianceWatchdog' || name === 'BoardIntelligenceOracle') {
    return tier === 'GROWTH' || tier === 'ENTERPRISE';
  }
  if (name === 'GrantLifecycleManager' || name === 'FinancialSentinel') {
    return tier === 'ENTERPRISE';
  }
  if (name === 'GrantIntelligenceHerald') {
    return tier === 'ENTERPRISE';
  }
  if (name === 'WorkerIncomeOptimizer') return false;
  return false;
}

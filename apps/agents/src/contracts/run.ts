import type { AutonomyTier } from '@magnus/db/types';

export type AgentName =
  | 'ComplianceWatchdog'
  | 'WorkerIncomeOptimizer'
  | 'GrantLifecycleManager'
  | 'BoardIntelligenceOracle'
  | 'FinancialSentinel';

export type ScopeType = 'org' | 'worker' | 'grant';

export type AgentWindow = {
  start: Date;
  end: Date;
};

export type AgentScope = {
  type: ScopeType;
  id: string;
};

export type AgentRunContext = {
  agentName: AgentName;
  scope: AgentScope;
  window: AgentWindow;
  /** Defaults to TIER_A_AUTONOMOUS in AgentRunLogger when omitted. */
  autonomyTier?: AutonomyTier;
  requiresHumanReview?: boolean;
  /** Structured pointers to domain rows or tool outputs (audit / evidence). */
  sourceRefs?: unknown;
};

export type AgentRunMetrics = Record<string, unknown>;


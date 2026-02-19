export type AgentName =
  | 'ComplianceWatchdog'
  | 'WorkerIncomeOptimizer'
  | 'GrantLifecycleManager';

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
};

export type AgentRunMetrics = Record<string, unknown>;


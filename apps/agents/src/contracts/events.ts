import type { AgentName, ScopeType } from './run';

export type AlertSeverity = 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';

export type AlertEvent = {
  agentName: AgentName;
  scopeType: ScopeType;
  scopeId: string;
  severity: AlertSeverity;
  type: string;
  title: string;
  body: string;
  recommendedActions: unknown;
  dedupeKey: string;
};


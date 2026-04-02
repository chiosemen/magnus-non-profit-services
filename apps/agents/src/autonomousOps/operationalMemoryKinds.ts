export const OPERATIONAL_MEMORY_KINDS_BY_AGENT = {
  ComplianceWatchdog: ['steward_compliance_scan'],
  GrantIntelligenceHerald: ['herald_grant_readiness_update'],
} as const;

export type OperationalMemoryAgentName = keyof typeof OPERATIONAL_MEMORY_KINDS_BY_AGENT;

export function assertOperationalMemoryKind(agentName: string, kind: string): void {
  const list = (OPERATIONAL_MEMORY_KINDS_BY_AGENT as Record<string, readonly string[]>)[agentName];
  if (!list) throw new Error('UNKNOWN_OPERATIONAL_MEMORY_AGENT');
  if (!list.includes(kind)) throw new Error('INVALID_OPERATIONAL_MEMORY_KIND');
}


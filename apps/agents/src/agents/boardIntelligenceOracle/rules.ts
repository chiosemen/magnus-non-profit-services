import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';

export type ComplianceRow = {
  id: string;
  dueDate: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'FILED';
  deadlineType: 'FORM_990' | 'STATE_REGISTRATION' | 'GRANT_REPORT';
};

export type GrantSummary = {
  id: string;
  funderName: string;
  endDate: Date;
  totalAmount: number;
  spentToDate: number;
};

export type OracleInputs = {
  ctx: AgentRunContext;
  org: { id: string; name: string; ein: string };
  complianceCalendar: ComplianceRow[];
  grants: GrantSummary[];
};

export function oracleDedupeKey(params: {
  agentName: string;
  scopeType: string;
  scopeId: string;
  alertType: string;
  windowEnd: Date;
}): string {
  return `${params.agentName}:${params.scopeType}:${params.scopeId}:${params.alertType}:${params.windowEnd.toISOString()}`;
}

export function runBoardIntelligenceOracleRules(inputs: OracleInputs): {
  alerts: AlertEvent[];
  skippedRules: string[];
  metrics: Record<string, unknown>;
} {
  const { ctx, org } = inputs;
  const alerts: AlertEvent[] = [];
  const skippedRules: string[] = [];
  const now = ctx.window.end;
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const pendingSoon = inputs.complianceCalendar.filter(
    c => c.status !== 'FILED' && c.dueDate <= in30 && c.dueDate >= new Date(now.getTime() - 1 * 86400000),
  );
  const overdue = inputs.complianceCalendar.filter(c => c.status !== 'FILED' && c.dueDate < now);

  const activeGrants = inputs.grants.filter(g => g.endDate >= now);

  const lines: string[] = [
    `Executive / board prep digest for ${org.name} (EIN ${org.ein}).`,
    '',
    `Compliance items not filed: ${inputs.complianceCalendar.filter(c => c.status !== 'FILED').length} total.`,
    `Due within 30 days (from run window end): ${pendingSoon.length}.`,
    `Appears overdue vs window end: ${overdue.length}.`,
    `Active grants (end on/after window end): ${activeGrants.length}.`,
  ];

  if (pendingSoon.length > 0) {
    lines.push('', 'Upcoming (30d):');
    for (const c of pendingSoon.slice(0, 8)) {
      lines.push(`- ${c.deadlineType} due ${c.dueDate.toISOString().slice(0, 10)} (${c.status})`);
    }
    if (pendingSoon.length > 8) lines.push(`- …and ${pendingSoon.length - 8} more`);
  }

  if (activeGrants.length > 0) {
    lines.push('', 'Grant pipeline (sample):');
    for (const g of activeGrants.slice(0, 6)) {
      const pct = g.totalAmount > 0 ? ((g.spentToDate / g.totalAmount) * 100).toFixed(1) : 'n/a';
      lines.push(`- ${g.funderName}: spends ${pct}% through period; ends ${g.endDate.toISOString().slice(0, 10)}`);
    }
    if (activeGrants.length > 6) lines.push(`- …and ${activeGrants.length - 6} more`);
  }

  lines.push(
    '',
    'This digest is internal-only and rule-based. Confirm all dates and amounts in source systems before board use.',
  );

  const severity = overdue.length > 0 ? 'HIGH' : pendingSoon.length > 0 ? 'MED' : 'LOW';

  alerts.push({
    agentName: ctx.agentName,
    scopeType: ctx.scope.type,
    scopeId: org.id,
    severity,
    type: 'BOARD_PREP_DIGEST',
    title: `Board / executive prep — ${org.name}`,
    body: lines.join('\n'),
    recommendedActions: [
      'Review compliance calendar entries in the dashboard.',
      'Validate grant balances and reporting dates with finance.',
      'Add open issues to the board agenda as needed.',
    ],
    dedupeKey: oracleDedupeKey({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: org.id,
      alertType: 'BOARD_PREP_DIGEST',
      windowEnd: ctx.window.end,
    }),
  });

  return {
    alerts,
    skippedRules,
    metrics: {
      pendingSoonCount: pendingSoon.length,
      overdueCount: overdue.length,
      activeGrantCount: activeGrants.length,
    },
  };
}

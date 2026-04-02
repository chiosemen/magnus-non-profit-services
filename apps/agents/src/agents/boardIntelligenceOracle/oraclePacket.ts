import type { AgentRunContext } from '../../contracts/run';
import type { AlertSeverity } from '@magnus/db/types';
import { isKnownSeverity, type Destination } from '@magnus/org-autonomous-ops-context';

/** Logical surface that produced cited data (dashboard / DB modules). */
export type OracleSourceModule =
  | 'compliance_calendar'
  | 'grants'
  | 'alerts_financial_watch'
  | 'alerts_compliance_ops'
  | 'alerts_other_internal'
  | 'org_context'
  | 'agent_handoffs'
  | 'operational_obligations';

export type OracleSourceRef = {
  module: OracleSourceModule;
  /** Stable handle: UUID or composite key */
  ref: string;
  label: string;
};

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
  startDate?: Date;
  totalAmount: number;
  spentToDate: number;
};

export type OrgAlertRow = {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  createdAt: Date;
};

export type OpenHandoffRow = {
  id: string;
  title: string;
  fromAgentName: string;
  createdAt: Date;
};

export type OrgContextRow = {
  id: string;
  kind: string;
  updatedAt: Date;
};

const FINANCIAL_WATCH_ALERT_TYPES = new Set(['GRANT_UNDERSPEND_PACE', 'GRANT_OVERSPEND_PACE']);

function isFinancialWatchAlert(type: string): boolean {
  return FINANCIAL_WATCH_ALERT_TYPES.has(type);
}

function truncateLabel(s: string, max: number): string {
  const raw = String(s ?? '');
  if (raw.length <= max) return raw;
  return `${raw.slice(0, Math.max(0, max - 1))}…`;
}

function isComplianceOpsAlert(type: string): boolean {
  return (
    type.startsWith('COMPLIANCE_') ||
    type.startsWith('FORM_990') ||
    type.startsWith('GRANT_REPORT_DEADLINE') ||
    type.startsWith('STATE_REGISTRATION')
  );
}

export type OracleBriefingPacket = {
  orgId: string;
  orgName: string;
  orgEin: string;
  asOfIso: string;
  windowStartIso: string;
  windowEndIso: string;
  compliance: {
    pendingSoon: Array<{ calendarId: string; deadlineType: string; dueDate: string; status: string }>;
    overdue: Array<{ calendarId: string; deadlineType: string; dueDate: string; status: string }>;
  };
  grants: {
    active: Array<{
      grantId: string;
      funderName: string;
      endDate: string;
      spentPct: string | null;
    }>;
  };
  financialWatch: { alerts: OrgAlertRow[] };
  complianceOpsAlerts: { alerts: OrgAlertRow[] };
  otherInternalAlerts: { alerts: OrgAlertRow[] };
  governance: {
    contextFiles: OrgContextRow[];
    openHandoffs: OpenHandoffRow[];
  };
  sourceIndex: OracleSourceRef[];
  /**
   * UI-style destinations for operators. These are stable identifiers, but may be unimplemented in this repo.
   * Consumers must treat `status !== IMPLEMENTED` as non-clickable guidance only.
   */
  destinations: Record<string, Destination>;
  disclaimers: string[];
};

export type BuildOraclePacketInput = {
  ctx: AgentRunContext;
  org: { id: string; name: string; ein: string };
  complianceCalendar: ComplianceRow[];
  grants: GrantSummary[];
  orgAlertsInWindow: OrgAlertRow[];
  openHandoffs: OpenHandoffRow[];
  orgContextFiles: OrgContextRow[];
};

/**
 * Assembles a bounded, source-linked briefing packet. No LLM / unsupported narrative synthesis.
 */
export function buildOracleBriefingPacket(input: BuildOraclePacketInput): OracleBriefingPacket {
  const { ctx, org } = input;
  const now = ctx.window.end;
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const pendingSoon = input.complianceCalendar.filter(
    c => c.status !== 'FILED' && c.dueDate <= in30 && c.dueDate >= new Date(now.getTime() - 1 * 86400000),
  );
  const overdue = input.complianceCalendar.filter(c => c.status !== 'FILED' && c.dueDate < now);
  const activeGrants = input.grants.filter(g => g.endDate >= now);

  const financial = input.orgAlertsInWindow.filter(a => isFinancialWatchAlert(a.type));
  const complianceOps = input.orgAlertsInWindow.filter(
    a => !isFinancialWatchAlert(a.type) && isComplianceOpsAlert(a.type),
  );
  const other = input.orgAlertsInWindow.filter(
    a => !isFinancialWatchAlert(a.type) && !isComplianceOpsAlert(a.type) && !a.type.startsWith('BOARD_'),
  );

  // Fail-closed: executive packet ordering and rendering assumes known severity vocabulary.
  for (const a of input.orgAlertsInWindow) {
    if (!isKnownSeverity(a.severity)) throw new Error('UNKNOWN_ALERT_SEVERITY');
  }

  const sourceIndex: OracleSourceRef[] = [];

  for (const c of input.complianceCalendar) {
    sourceIndex.push({
      module: 'compliance_calendar',
      ref: c.id,
      label: `${c.deadlineType} (${c.id.slice(0, 8)}…)`,
    });
  }
  for (const g of input.grants) {
    sourceIndex.push({
      module: 'grants',
      ref: g.id,
      label: `${g.funderName} (${g.id.slice(0, 8)}…)`,
    });
  }
  for (const a of financial) {
    sourceIndex.push({
      module: 'alerts_financial_watch',
      ref: a.id,
      label: truncateLabel(`${a.type}: ${a.title}`, 140),
    });
  }
  for (const a of complianceOps) {
    sourceIndex.push({
      module: 'alerts_compliance_ops',
      ref: a.id,
      label: truncateLabel(`${a.type}: ${a.title}`, 140),
    });
  }
  for (const a of other.slice(0, 15)) {
    sourceIndex.push({
      module: 'alerts_other_internal',
      ref: a.id,
      label: truncateLabel(`${a.type}: ${a.title}`, 140),
    });
  }
  for (const f of input.orgContextFiles) {
    sourceIndex.push({
      module: 'org_context',
      ref: f.id,
      label: `${f.kind} (${f.id.slice(0, 8)}…)`,
    });
  }
  for (const h of input.openHandoffs) {
    sourceIndex.push({
      module: 'agent_handoffs',
      ref: h.id,
      label: truncateLabel(`${h.fromAgentName} → ${h.title}`, 120),
    });
  }

  // Derived obligations surface (no DB row ID); include as a bounded operator reference.
  sourceIndex.push({
    module: 'operational_obligations',
    ref: 'derived:/api/org/autonomous-ops/obligations/active',
    label: 'Active obligations (derived from Alerts, Handoffs, ComplianceCalendar)',
  });

  // Deterministic ordering for downstream stability (no semantic meaning).
  sourceIndex.sort((a, b) => {
    const m = a.module.localeCompare(b.module);
    if (m !== 0) return m;
    return a.ref.localeCompare(b.ref);
  });

  return {
    orgId: org.id,
    orgName: org.name,
    orgEin: org.ein,
    asOfIso: now.toISOString(),
    windowStartIso: ctx.window.start.toISOString(),
    windowEndIso: ctx.window.end.toISOString(),
    compliance: {
      pendingSoon: pendingSoon.map(c => ({
        calendarId: c.id,
        deadlineType: c.deadlineType,
        dueDate: c.dueDate.toISOString().slice(0, 10),
        status: c.status,
      })),
      overdue: overdue.map(c => ({
        calendarId: c.id,
        deadlineType: c.deadlineType,
        dueDate: c.dueDate.toISOString().slice(0, 10),
        status: c.status,
      })),
    },
    grants: {
      active: activeGrants.map(g => ({
        grantId: g.id,
        funderName: g.funderName,
        endDate: g.endDate.toISOString().slice(0, 10),
        spentPct:
          g.totalAmount > 0 ? ((g.spentToDate / g.totalAmount) * 100).toFixed(1) : null,
      })),
    },
    financialWatch: { alerts: financial },
    complianceOpsAlerts: { alerts: complianceOps },
    otherInternalAlerts: { alerts: other.slice(0, 15) },
    governance: {
      contextFiles: input.orgContextFiles,
      openHandoffs: input.openHandoffs,
    },
    sourceIndex,
    destinations: {
      alerts: { href: '/app/autonomous-ops/alerts', status: 'UNIMPLEMENTED_IN_REPO' },
      handoffs: { href: '/app/autonomous-ops/handoffs', status: 'UNIMPLEMENTED_IN_REPO' },
      compliance: { href: '/app/compliance', status: 'UNIMPLEMENTED_IN_REPO' },
      grants: { href: '/app/grants', status: 'UNIMPLEMENTED_IN_REPO' },
      orgContext: { href: '/app/autonomous-ops/identity-files', status: 'UNIMPLEMENTED_IN_REPO' },
      activeObligations: { href: '/api/org/autonomous-ops/obligations/active', status: 'IMPLEMENTED' },
    },
    disclaimers: [
      'Internal draft only. Does not constitute board approval, legal advice, or authoritative financial statements.',
      'Figures and dates are rolled up from linked sources; verify in primary systems before distribution.',
      'No external communications are sent by this agent.',
    ],
  };
}

function formatSourceAppendix(packet: OracleBriefingPacket): string {
  const lines = ['', '---', '**Source index** (verify in dashboard / DB):'];
  for (const s of packet.sourceIndex.slice(0, 80)) {
    lines.push(`- \`${s.module}\` → \`${s.ref}\` — ${s.label}`);
  }
  if (packet.sourceIndex.length > 80) {
    lines.push(`- …and ${packet.sourceIndex.length - 80} more references truncated`);
  }
  return lines.join('\n');
}

/** Weekly executive rollup — narrative is template-only, tied to packet fields. */
export function formatWeeklyExecutiveSummary(packet: OracleBriefingPacket): string {
  const lines: string[] = [
    `# Weekly executive summary — ${packet.orgName}`,
    `EIN ${packet.orgEin} · as of window end ${packet.windowEndIso.slice(0, 10)}`,
    '',
    '## Compliance (calendar)',
    `- Due within ~30d of window end: ${packet.compliance.pendingSoon.length}`,
    `- Overdue vs window end: ${packet.compliance.overdue.length}`,
    '',
    '## Grants (active)',
    `- Count: ${packet.grants.active.length}`,
    '',
    '## Financial watch (alerts in window)',
    `- FinancialSentinel-class alerts: ${packet.financialWatch.alerts.length}`,
    '',
    '## Compliance operations (alerts in window)',
    `- ComplianceWatchdog-class alerts: ${packet.complianceOpsAlerts.alerts.length}`,
    '',
    '## Other internal alerts (sample)',
    `- Count (capped): ${packet.otherInternalAlerts.alerts.length}`,
    '',
    '## Governance signals',
    `- Org context files on record: ${packet.governance.contextFiles.length}`,
    `- Open agent handoffs: ${packet.governance.openHandoffs.length}`,
    '',
    '## Disclaimers',
    ...packet.disclaimers.map(d => `- ${d}`),
  ];
  lines.push(formatSourceAppendix(packet));
  return lines.join('\n');
}

/** Pre-board checklist-style packet; same facts, board-readiness framing. */
export function formatPreBoardBriefingPacket(packet: OracleBriefingPacket): string {
  const lines: string[] = [
    `# Pre-board briefing packet (draft) — ${packet.orgName}`,
    `EIN ${packet.orgEin} · prepared from sources through ${packet.windowEndIso.slice(0, 10)}`,
    '',
    '## Readiness checklist',
    `- [ ] Compliance: resolve or agenda ${packet.compliance.overdue.length} overdue item(s); track ${packet.compliance.pendingSoon.length} due soon.`,
    `- [ ] Grants: review ${packet.grants.active.length} active award(s) for reporting and balance questions.`,
    `- [ ] Finance: review ${packet.financialWatch.alerts.length} financial-watch alert(s) from the period.`,
    `- [ ] Operations: review ${packet.complianceOpsAlerts.alerts.length} compliance-ops alert(s) from the period.`,
    `- [ ] Governance: confirm ${packet.governance.openHandoffs.length} open handoff(s) and ${packet.governance.contextFiles.length} identity/context file(s) are current.`,
    '',
    '## Overdue compliance (source: compliance_calendar)',
    ...packet.compliance.overdue.map(
      c => `- ${c.deadlineType} due ${c.dueDate} (\`${c.calendarId}\`) — ${c.status}`,
    ),
    ...(packet.compliance.overdue.length === 0 ? ['- None in this rollup.'] : []),
    '',
    '## Upcoming compliance (30d, source: compliance_calendar)',
    ...packet.compliance.pendingSoon.map(
      c => `- ${c.deadlineType} due ${c.dueDate} (\`${c.calendarId}\`) — ${c.status}`,
    ),
    ...(packet.compliance.pendingSoon.length === 0 ? ['- None in this rollup.'] : []),
    '',
    '## Active grants (sample, source: grants)',
    ...packet.grants.active.slice(0, 8).map(
      g => `- ${g.funderName}: ~${g.spentPct ?? 'n/a'}% spent, ends ${g.endDate} (\`${g.grantId}\`)`,
    ),
    ...(packet.grants.active.length > 8
      ? [`- …and ${packet.grants.active.length - 8} more (see source index)`]
      : []),
    ...(packet.grants.active.length === 0 ? ['- None in this rollup.'] : []),
    '',
    '## Financial watch — alerts in window (source: alerts_financial_watch)',
    ...packet.financialWatch.alerts.map(
      a => `- [${a.severity}] ${a.title} (\`${a.id}\` · ${a.type})`,
    ),
    ...(packet.financialWatch.alerts.length === 0 ? ['- None in this window.'] : []),
    '',
    '## Open handoffs (source: agent_handoffs)',
    ...packet.governance.openHandoffs.slice(0, 12).map(
      h => `- From ${h.fromAgentName}: ${h.title} (\`${h.id}\`)`,
    ),
    ...(packet.governance.openHandoffs.length > 12
      ? [`- …and ${packet.governance.openHandoffs.length - 12} more`]
      : []),
    ...(packet.governance.openHandoffs.length === 0 ? ['- None open.'] : []),
    '',
    '## Disclaimers',
    ...packet.disclaimers.map(d => `- ${d}`),
  ];
  lines.push(formatSourceAppendix(packet));
  return lines.join('\n');
}

export function oracleMaxSeverity(packet: OracleBriefingPacket): 'LOW' | 'MED' | 'HIGH' | 'CRITICAL' {
  const collect = [
    ...packet.financialWatch.alerts,
    ...packet.complianceOpsAlerts.alerts,
    ...packet.otherInternalAlerts.alerts,
  ];
  if (collect.some(a => a.severity === 'CRITICAL')) return 'CRITICAL';
  if (packet.compliance.overdue.length > 0 || collect.some(a => a.severity === 'HIGH')) return 'HIGH';
  if (packet.compliance.pendingSoon.length > 0 || collect.some(a => a.severity === 'MED')) return 'MED';
  return 'LOW';
}

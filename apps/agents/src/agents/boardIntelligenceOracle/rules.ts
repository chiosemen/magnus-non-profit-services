import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';
import type { OrgContextValidationReport } from '@magnus/org-autonomous-ops-context';
import {
  buildOracleBriefingPacket,
  formatPreBoardBriefingPacket,
  formatWeeklyExecutiveSummary,
  oracleMaxSeverity,
  type BuildOraclePacketInput,
  type ComplianceRow,
  type GrantSummary,
  type OrgAlertRow,
  type OpenHandoffRow,
  type OrgContextRow,
} from './oraclePacket';

export type { ComplianceRow, GrantSummary, OrgAlertRow, OpenHandoffRow, OrgContextRow };

export type OracleInputs = BuildOraclePacketInput & {
  orgContextValidationReport?: OrgContextValidationReport;
};

function formatOrgContextGapBody(report: OrgContextValidationReport): string {
  const lines = [
    'Some org context files are still templates or missing minimum operator content. Weekly and pre-board briefings still run, but governance signals may be thin.',
    '',
    '**Per-file status** (see `/app/autonomous-ops/directory` in pilot):',
  ];
  for (const row of report.rows) {
    lines.push(`- [${row.kind}] ${row.status} (${row.configuredState}) — ${row.blockers.join('; ') || 'ok'}`);
  }
  lines.push('', '**Suggested actions**');
  for (const a of report.operatorActions.slice(0, 5)) {
    lines.push(`- ${a}`);
  }
  lines.push('', 'Internal only; no external send.');
  return lines.join('\n');
}

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
  packet: ReturnType<typeof buildOracleBriefingPacket>;
} {
  const { ctx, org } = inputs;
  const skippedRules: string[] = [];

  const packet = buildOracleBriefingPacket(inputs);
  const sev = oracleMaxSeverity(packet);

  const weeklyBody = formatWeeklyExecutiveSummary(packet);
  const preBoardBody = formatPreBoardBriefingPacket(packet);

  const gapAlerts: AlertEvent[] = [];
  const vr = inputs.orgContextValidationReport;
  if (vr && vr.rows.some(r => r.status !== 'READY')) {
    gapAlerts.push({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: org.id,
      severity: 'LOW',
      type: 'ORACLE_ORG_CONTEXT_INCOMPLETE',
      title: `Org context incomplete — ${org.name}`,
      body: formatOrgContextGapBody(vr),
      recommendedActions: [
        'Review org context files in the Directory / identity surfaces.',
        'Complete ORG_IDENTITY grant fields (NTEE, state, annual revenue) before relying on grant matching.',
      ],
      dedupeKey: oracleDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        alertType: 'ORACLE_ORG_CONTEXT_INCOMPLETE',
        windowEnd: ctx.window.end,
      }),
    });
  }

  const alerts: AlertEvent[] = [
    ...gapAlerts,
    {
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: org.id,
      severity: sev,
      type: 'BOARD_WEEKLY_EXEC_SUMMARY',
      title: `Weekly executive summary — ${org.name}`,
      body: weeklyBody,
      recommendedActions: [
        {
          label: 'Review the executive board (operator view)',
          kind: 'navigate',
          url: '/app/autonomous-ops/executive',
          sourceRefs: [{ type: 'dest', href: '/app/autonomous-ops/executive', status: 'UNIMPLEMENTED_IN_REPO' }],
        },
        {
          label: 'Review active obligations (derived)',
          kind: 'navigate',
          url: '/api/org/autonomous-ops/obligations/active',
          sourceRefs: [{ type: 'dest', href: '/api/org/autonomous-ops/obligations/active', status: 'IMPLEMENTED' }],
        },
        {
          label: 'Review alerts and resolve ownership/status',
          kind: 'navigate',
          url: '/app/autonomous-ops/alerts',
          sourceRefs: [{ type: 'dest', href: '/app/autonomous-ops/alerts', status: 'UNIMPLEMENTED_IN_REPO' }],
        },
        'Verify source IDs in the appendix against DB-backed surfaces before action.',
      ],
      dedupeKey: oracleDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        alertType: 'BOARD_WEEKLY_EXEC_SUMMARY',
        windowEnd: ctx.window.end,
      }),
    },
    {
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: org.id,
      severity: sev,
      type: 'BOARD_PRE_BOARD_BRIEFING',
      title: `Pre-board briefing packet (draft) — ${org.name}`,
      body: preBoardBody,
      recommendedActions: [
        {
          label: 'Confirm overdue compliance items',
          kind: 'navigate',
          url: '/app/compliance',
          sourceRefs: [{ type: 'dest', href: '/app/compliance', status: 'UNIMPLEMENTED_IN_REPO' }],
        },
        {
          label: 'Review active obligations (derived)',
          kind: 'navigate',
          url: '/api/org/autonomous-ops/obligations/active',
          sourceRefs: [{ type: 'dest', href: '/api/org/autonomous-ops/obligations/active', status: 'IMPLEMENTED' }],
        },
        {
          label: 'Review open handoffs and assign owners',
          kind: 'navigate',
          url: '/app/autonomous-ops/handoffs',
          sourceRefs: [{ type: 'dest', href: '/app/autonomous-ops/handoffs', status: 'UNIMPLEMENTED_IN_REPO' }],
        },
        'Staff must verify all cited items in primary systems — this is draft internal material only.',
      ],
      dedupeKey: oracleDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        alertType: 'BOARD_PRE_BOARD_BRIEFING',
        windowEnd: ctx.window.end,
      }),
    },
  ];

  return {
    alerts,
    skippedRules,
    metrics: {
      pendingSoonCount: packet.compliance.pendingSoon.length,
      overdueCount: packet.compliance.overdue.length,
      activeGrantCount: packet.grants.active.length,
      financialWatchAlertCount: packet.financialWatch.alerts.length,
      complianceOpsAlertCount: packet.complianceOpsAlerts.alerts.length,
      openHandoffCount: packet.governance.openHandoffs.length,
      orgContextFileCount: packet.governance.contextFiles.length,
      sourceRefCount: packet.sourceIndex.length,
    },
    packet,
  };
}

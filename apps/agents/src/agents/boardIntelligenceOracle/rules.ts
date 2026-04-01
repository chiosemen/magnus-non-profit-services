import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';
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

export type OracleInputs = BuildOraclePacketInput;

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

  const alerts: AlertEvent[] = [
    {
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: org.id,
      severity: sev,
      type: 'BOARD_WEEKLY_EXEC_SUMMARY',
      title: `Weekly executive summary — ${org.name}`,
      body: weeklyBody,
      recommendedActions: [
        'Review linked source IDs in the appendix against the org dashboard.',
        'Route open questions to finance (grants) and compliance owners.',
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
        'Confirm agenda items against overdue compliance and open handoffs.',
        'Staff to verify all cited alerts in primary systems — not board-approved material.',
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

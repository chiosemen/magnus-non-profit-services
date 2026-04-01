import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runComplianceWatchdogRules } from './rules';
import { AgentHandoffService, OrgMemoryService } from '@magnus/org-autonomous-ops-context';
import type { PrismaClient } from '@magnus/db/types';
import { buildStewardOracleHandoffInput, STEWARD_ORACLE_HANDOFF_TITLE } from './stewardHandoffs';
import { assertInternalSideEffectAllowed } from '../../autonomy/enforcement';

/**
 * STEWARD (roadmap) — persisted agent name remains `ComplianceWatchdog`.
 * Internal compliance orchestration: alerts, optional ORACLE handoff, operational memory scan log.
 * Does not file, email externally, or mutate compliance state beyond creating alerts/handoffs/memory rows.
 */
export class ComplianceWatchdog {
  private readonly sink: AlertSink;
  private readonly handoffSvc: AgentHandoffService;
  private readonly memorySvc: OrgMemoryService;

  constructor(sink: AlertSink) {
    this.sink = sink;
    const db = prisma as unknown as PrismaClient;
    this.handoffSvc = new AgentHandoffService(db);
    this.memorySvc = new OrgMemoryService(db);
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const orgId = ctx.scope.id;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        ein: true,
        name: true,
        annualRevenue: true,
        subscriptionTier: true,
        fiscalYearEnd: true,
      },
    });
    if (!org) {
      throw new Error('Organization not found');
    }

    const complianceCalendar = await prisma.complianceCalendar.findMany({
      where: { orgId: org.id },
      select: { id: true, dueDate: true, status: true, deadlineType: true },
    });

    const grants = await prisma.grant.findMany({
      where: { orgId: org.id },
      select: { id: true, reportingSchedule: true },
    });

    const grantReportDeadlines = extractGrantReportDeadlines(grants);

    const uses990Postcard = org.subscriptionTier === 'STARTER';
    const annualRevenue = org.annualRevenue === null ? null : Number(org.annualRevenue);

    // Governance lapse detection: requires GovernanceProfile (or similar) in schema — not present on this line; calendar + 990 heuristics only.
    const result = runComplianceWatchdogRules({
      ctx,
      org: {
        id: org.id,
        ein: org.ein,
        name: org.name,
        annualRevenue,
        subscriptionTier: org.subscriptionTier,
        uses990Postcard,
        fiscalYearEnd: org.fiscalYearEnd,
      },
      complianceCalendar: complianceCalendar.map(i => ({
        id: i.id,
        dueDate: i.dueDate,
        status: i.status,
        deadlineType: i.deadlineType,
      })),
      grantReportDeadlines,
    });

    for (const alert of result.alerts) {
      await this.sink.emit(alert);
    }

    const highAlerts = result.alerts.filter(a => a.severity === 'HIGH');
    let stewardHandoffCreated = false;
    let stewardHandoffSkipped: string | null = null;

    const handoffInput = buildStewardOracleHandoffInput(result.alerts);
    if (handoffInput) {
      const openDup = await prisma.agentHandoff.count({
        where: {
          orgId: org.id,
          fromAgentName: 'ComplianceWatchdog',
          toAgentName: 'BoardIntelligenceOracle',
          status: 'OPEN',
          title: STEWARD_ORACLE_HANDOFF_TITLE,
        },
      });
      if (openDup > 0) {
        stewardHandoffSkipped = 'open_oracle_handoff_exists';
      } else {
        assertInternalSideEffectAllowed({ autonomyTier: ctx.autonomyTier, requiresHumanReview: ctx.requiresHumanReview, effect: 'handoff' });
        await this.handoffSvc.create(org.id, handoffInput);
        stewardHandoffCreated = true;
      }
    }

    let stewardMemoryAppended = false;
    try {
      assertInternalSideEffectAllowed({ autonomyTier: ctx.autonomyTier, requiresHumanReview: ctx.requiresHumanReview, effect: 'memory' });
      await this.memorySvc.appendOperational(org.id, {
        agentName: 'ComplianceWatchdog',
        kind: 'steward_compliance_scan',
        payload: {
          alertsEmitted: result.alerts.length,
          highSeverityCount: highAlerts.length,
          stewardHandoffCreated,
          stewardHandoffSkipped,
          skippedRules: result.skippedRules,
        },
        sourceRefs: [{ type: 'steward_scan', windowEnd: ctx.window.end.toISOString() }],
        confidence: 0.85,
      });
      stewardMemoryAppended = true;
    } catch {
      stewardMemoryAppended = false;
    }

    return {
      orgId: org.id,
      alertsEmitted: result.alerts.length,
      highSeverityCount: highAlerts.length,
      skippedRules: result.skippedRules,
      stewardHandoffCreated,
      stewardHandoffSkipped,
      stewardMemoryAppended,
    };
  }
}

function extractGrantReportDeadlines(grants: Array<{ id: string; reportingSchedule: unknown }>) {
  const out: Array<{ grantId: string; dueDate: Date; title: string }> = [];
  for (const g of grants) {
    const rs = g.reportingSchedule;
    let list: unknown[] = [];
    if (Array.isArray(rs)) list = rs;
    else if (rs && typeof rs === 'object' && 'deadlines' in rs) {
      const d = (rs as { deadlines?: unknown }).deadlines;
      if (Array.isArray(d)) list = d;
    }

    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const dueRaw = item['dueDate'] ?? item['due_date'] ?? item['date'];
      const titleRaw = item['title'] ?? item['name'] ?? 'Grant report';
      if (dueRaw === undefined || dueRaw === null) continue;
      const d = new Date(String(dueRaw));
      if (Number.isNaN(d.getTime())) continue;
      out.push({ grantId: g.id, dueDate: d, title: String(titleRaw) });
    }
  }
  return out;
}

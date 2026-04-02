import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runBoardIntelligenceOracleRules } from './rules';
import type { OrgAlertRow, OpenHandoffRow, OrgContextRow } from './oraclePacket';
import type { AlertSeverity } from '@magnus/db/types';

/**
 * ORACLE — Board Intelligence: bounded internal briefings from compliance, grants,
 * financial-watch alerts, governance handoffs, and org context files. Template text only;
 * no external send, no board approval claims.
 */
export class BoardIntelligenceOracle {
  private readonly sink: AlertSink;

  constructor(sink: AlertSink) {
    this.sink = sink;
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const orgId = ctx.scope.id;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, ein: true },
    });
    if (!org) throw new Error('Organization not found');

    const [complianceCalendar, grants, orgAlertsRaw, openHandoffsRaw, orgContextFilesRaw] =
      await Promise.all([
        prisma.complianceCalendar.findMany({
          where: { orgId: org.id },
          select: { id: true, dueDate: true, status: true, deadlineType: true },
        }),
        prisma.grant.findMany({
          where: { orgId: org.id },
          select: {
            id: true,
            funderName: true,
            startDate: true,
            endDate: true,
            totalAmount: true,
            spentToDate: true,
          },
        }),
        prisma.alert.findMany({
          where: {
            scopeType: 'ORG',
            scopeId: org.id,
            createdAt: { gte: ctx.window.start, lte: ctx.window.end },
          },
          orderBy: { createdAt: 'desc' },
          take: 80,
          select: { id: true, type: true, severity: true, title: true, createdAt: true },
        }),
        prisma.agentHandoff.findMany({
          where: { orgId: org.id, status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          take: 40,
          select: { id: true, title: true, fromAgentName: true, createdAt: true },
        }),
        prisma.orgContextFile.findMany({
          where: { orgId: org.id },
          select: { id: true, kind: true, updatedAt: true },
        }),
      ]);

    const orgAlertsInWindow: OrgAlertRow[] = orgAlertsRaw.map(a => ({
      id: a.id,
      type: a.type,
      severity: a.severity as AlertSeverity,
      title: a.title,
      createdAt: a.createdAt,
    }));

    const openHandoffs: OpenHandoffRow[] = openHandoffsRaw.map(h => ({
      id: h.id,
      title: h.title,
      fromAgentName: h.fromAgentName,
      createdAt: h.createdAt,
    }));

    const orgContextFiles: OrgContextRow[] = orgContextFilesRaw.map(f => ({
      id: f.id,
      kind: f.kind,
      updatedAt: f.updatedAt,
    }));

    const result = runBoardIntelligenceOracleRules({
      ctx,
      org,
      complianceCalendar: complianceCalendar.map(r => ({
        id: r.id,
        dueDate: r.dueDate,
        status: r.status,
        deadlineType: r.deadlineType,
      })),
      grants: grants.map(g => ({
        id: g.id,
        funderName: g.funderName,
        startDate: g.startDate,
        endDate: g.endDate,
        totalAmount: Number(g.totalAmount),
        spentToDate: Number(g.spentToDate),
      })),
      orgAlertsInWindow,
      openHandoffs,
      orgContextFiles,
    });

    for (const alert of result.alerts) {
      await this.sink.emit(alert);
    }

    const sourceRefs = {
      orgId: org.id,
      complianceRowCount: complianceCalendar.length,
      grantRowCount: grants.length,
      alertsInWindowCount: orgAlertsInWindow.length,
      openHandoffCount: openHandoffs.length,
      orgContextFileCount: orgContextFiles.length,
      sourceIndexSample: result.packet.sourceIndex.slice(0, 12),
    };

    return {
      orgId: org.id,
      alertsEmitted: result.alerts.length,
      skippedRules: result.skippedRules,
      ...result.metrics,
      sourceRefs,
    };
  }
}

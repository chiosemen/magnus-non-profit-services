import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runBoardIntelligenceOracleRules } from './rules';

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

    const complianceCalendar = await prisma.complianceCalendar.findMany({
      where: { orgId: org.id },
      select: { id: true, dueDate: true, status: true, deadlineType: true },
    });

    const grants = await prisma.grant.findMany({
      where: { orgId: org.id },
      select: {
        id: true,
        funderName: true,
        endDate: true,
        totalAmount: true,
        spentToDate: true,
      },
    });

    const sourceRefs = {
      orgId: org.id,
      complianceRowCount: complianceCalendar.length,
      grantRowCount: grants.length,
    };

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
        endDate: g.endDate,
        totalAmount: Number(g.totalAmount),
        spentToDate: Number(g.spentToDate),
      })),
    });

    for (const alert of result.alerts) {
      await this.sink.emit(alert);
    }

    return {
      orgId: org.id,
      alertsEmitted: result.alerts.length,
      skippedRules: result.skippedRules,
      ...result.metrics,
      sourceRefs, // lifted to AgentRun.sourceRefs in AgentRunLogger.finishSuccess
    };
  }
}

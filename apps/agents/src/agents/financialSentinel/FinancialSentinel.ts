import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runFinancialSentinelRules } from './rules';

export class FinancialSentinel {
  private readonly sink: AlertSink;

  constructor(sink: AlertSink) {
    this.sink = sink;
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const orgId = ctx.scope.id;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) throw new Error('Organization not found');

    const grants = await prisma.grant.findMany({
      where: { orgId: org.id },
      select: {
        id: true,
        funderName: true,
        totalAmount: true,
        spentToDate: true,
        startDate: true,
        endDate: true,
      },
    });

    const sourceRefs = {
      orgId: org.id,
      grantIds: grants.map(g => g.id),
    };

    const result = runFinancialSentinelRules({
      ctx,
      orgId: org.id,
      grants: grants.map(g => ({
        id: g.id,
        funderName: g.funderName,
        totalAmount: Number(g.totalAmount),
        spentToDate: Number(g.spentToDate),
        startDate: g.startDate,
        endDate: g.endDate,
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
      sourceRefs,
    };
  }
}

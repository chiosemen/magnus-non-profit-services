import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runGrantLifecycleRules } from './rules';

export class GrantLifecycleManager {
  private readonly sink: AlertSink;

  constructor(sink: AlertSink) {
    this.sink = sink;
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const grantId = ctx.scope.id;
    const grant = await prisma.grant.findUnique({
      where: { id: grantId },
      select: {
        id: true,
        orgId: true,
        funderName: true,
        totalAmount: true,
        spentToDate: true,
        startDate: true,
        endDate: true,
        reportingSchedule: true,
      },
    });
    if (!grant) throw new Error('Grant not found');

    const relationships = await prisma.workerOrgRelationship.findMany({
      where: { grantFunded: true, grantId: grantId },
      select: { workerId: true },
    });

    const compliance = await prisma.complianceCalendar.findMany({
      where: { orgId: grant.orgId, deadlineType: 'GRANT_REPORT' },
      select: { id: true, dueDate: true, status: true },
    });

    const result = runGrantLifecycleRules({
      ctx,
      grant: {
        id: grant.id,
        orgId: grant.orgId,
        funderName: grant.funderName,
        totalAmount: Number(grant.totalAmount),
        spentToDate: Number(grant.spentToDate),
        startDate: grant.startDate,
        endDate: grant.endDate,
        reportingSchedule: grant.reportingSchedule,
      },
      workerIds: relationships.map(r => r.workerId),
      complianceGrantReportCalendar: compliance.map(c => ({
        id: c.id,
        dueDate: c.dueDate,
        status: c.status,
      })),
    });

    for (const alert of result.alerts) {
      await this.sink.emit(alert);
    }

    return {
      alertsEmitted: result.alerts.length,
      ...result.metrics,
    };
  }
}

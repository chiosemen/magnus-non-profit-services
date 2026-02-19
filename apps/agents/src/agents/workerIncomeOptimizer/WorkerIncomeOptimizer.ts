import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runWorkerIncomeOptimizerRules } from './rules';

export class WorkerIncomeOptimizer {
  private readonly sink: AlertSink;

  constructor(sink: AlertSink) {
    this.sink = sink;
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const workerId = ctx.scope.id;

    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      select: { id: true },
    });
    if (!worker) throw new Error('Worker not found');

    const now = ctx.window.end;
    const start90 = new Date(now.getTime() - 90 * 86400000);
    const start180 = new Date(now.getTime() - 180 * 86400000);

    const [tx90, tx180, taxEstimates] = await Promise.all([
      prisma.incomeTransaction.findMany({
        where: { workerId, transactionDate: { gte: start90, lte: now } },
        select: { amount: true, transactionDate: true, sourceOrgId: true },
      }),
      prisma.incomeTransaction.findMany({
        where: { workerId, transactionDate: { gte: start180, lte: now } },
        select: { amount: true, transactionDate: true, sourceOrgId: true },
      }),
      prisma.taxEstimate.findMany({
        where: { workerId, taxYear: now.getFullYear() },
        select: {
          taxYear: true,
          quarter: true,
          estimatedFederal: true,
          estimatedState: true,
          paidFederal: true,
          paidState: true,
          dueDate: true,
        },
      }),
    ]);

    const result = runWorkerIncomeOptimizerRules({
      ctx,
      workerId,
      transactions90d: tx90.map(t => ({
        amount: Number(t.amount),
        transactionDate: t.transactionDate,
        sourceOrgId: t.sourceOrgId,
      })),
      transactions180d: tx180.map(t => ({
        amount: Number(t.amount),
        transactionDate: t.transactionDate,
        sourceOrgId: t.sourceOrgId,
      })),
      taxEstimates: taxEstimates.map(e => ({
        taxYear: e.taxYear,
        quarter: e.quarter,
        estimatedFederal: Number(e.estimatedFederal),
        estimatedState: Number(e.estimatedState),
        paidFederal: e.paidFederal === null ? null : Number(e.paidFederal),
        paidState: e.paidState === null ? null : Number(e.paidState),
        dueDate: e.dueDate,
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


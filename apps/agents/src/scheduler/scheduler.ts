import { subscriptionAllowsScheduledAgent } from '@magnus/subscription';
import type { AgentName, AgentRunContext, ScopeType } from '../contracts/run';
import { prisma } from '../db';
import { AgentRunLogger } from '../audit/AgentRunLogger';
import type { AlertSink } from '../sinks/AlertSink';
import { tryAdvisoryXactLock } from './locks';
import { ComplianceWatchdog } from '../agents/complianceWatchdog/ComplianceWatchdog';
import { WorkerIncomeOptimizer } from '../agents/workerIncomeOptimizer/WorkerIncomeOptimizer';
import { GrantLifecycleManager } from '../agents/grantLifecycleManager/GrantLifecycleManager';
import { BoardIntelligenceOracle } from '../agents/boardIntelligenceOracle/BoardIntelligenceOracle';
import { FinancialSentinel } from '../agents/financialSentinel/FinancialSentinel';

export type SchedulerDeps = {
  alertSink: AlertSink;
};

export class Scheduler {
  private readonly runLogger = new AgentRunLogger();
  private readonly deps: SchedulerDeps;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  async runAgentOnce(params: { agentName: AgentName; scopeType: ScopeType; scopeId: string; window: { start: Date; end: Date } }): Promise<void> {
    const ctx: AgentRunContext = {
      agentName: params.agentName,
      scope: { type: params.scopeType, id: params.scopeId },
      window: params.window,
    };

    // Fail-closed: ensure DB is reachable before attempting run.
    await prisma.$queryRaw`SELECT 1`;

    const lockKey = `${ctx.agentName}:${ctx.scope.type}:${ctx.scope.id}:${ctx.window.end.toISOString()}`;
    await prisma.$transaction(
      async tx => {
        const acquired = await tryAdvisoryXactLock(lockKey, tx as any);
        if (!acquired) {
          throw new Error('Agent run blocked by lock (another run in progress for the same scope/window).');
        }

        let runId: string | null = null;
        const metrics: Record<string, unknown> = { skippedRules: [] as string[] };
        try {
          runId = await this.runLogger.start(ctx);
          const agent = this.getAgent(ctx.agentName, this.deps.alertSink);
          const agentMetrics = await agent.run(ctx);
          Object.assign(metrics, agentMetrics);
          await this.runLogger.finishSuccess(runId, metrics);
        } catch (err) {
          if (runId) {
            await this.runLogger.finishFailed(runId, err, metrics);
          }
          throw err;
        }
      },
      // Hold a single DB session open so pg_try_advisory_xact_lock remains active for the whole agent run.
      { maxWait: 5000, timeout: 10 * 60 * 1000 },
    );
  }

  async runScheduled(agentName: AgentName, window: { start: Date; end: Date }): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;

    if (
      agentName === 'ComplianceWatchdog' ||
      agentName === 'BoardIntelligenceOracle' ||
      agentName === 'FinancialSentinel'
    ) {
      const orgs = await prisma.organization.findMany({
        where: { subscriptionStatus: 'ACTIVE' },
        select: { id: true, subscriptionTier: true },
      });
      const ids = orgs
        .filter(o =>
          subscriptionAllowsScheduledAgent({
            tier: o.subscriptionTier,
            status: 'ACTIVE',
            agentName,
          }),
        )
        .map(o => o.id);
      await this.runForScopes(agentName, 'org', ids, window);
      return;
    }
    if (agentName === 'WorkerIncomeOptimizer') {
      const rels = await prisma.workerOrgRelationship.findMany({
        where: { organization: { subscriptionStatus: 'ACTIVE' } },
        select: { workerId: true, organization: { select: { subscriptionTier: true } } },
      });
      const workerIds = Array.from(
        new Set(
          rels
            .filter(r =>
              subscriptionAllowsScheduledAgent({
                tier: r.organization.subscriptionTier,
                status: 'ACTIVE',
                agentName,
              }),
            )
            .map(r => r.workerId),
        ),
      );
      await this.runForScopes(agentName, 'worker', workerIds, window);
      return;
    }
    if (agentName === 'GrantLifecycleManager') {
      const grants = await prisma.grant.findMany({
        where: { organization: { subscriptionStatus: 'ACTIVE' } },
        select: { id: true, organization: { select: { subscriptionTier: true } } },
      });
      const grantIds = grants
        .filter(g =>
          subscriptionAllowsScheduledAgent({
            tier: g.organization.subscriptionTier,
            status: 'ACTIVE',
            agentName,
          }),
        )
        .map(g => g.id);
      await this.runForScopes(agentName, 'grant', grantIds, window);
      return;
    }
  }

  private async runForScopes(agentName: AgentName, scopeType: ScopeType, ids: string[], window: { start: Date; end: Date }): Promise<void> {
    // Concurrency is bounded to avoid stampeding the DB.
    const concurrency = 5;
    let idx = 0;
    let errors = 0;
    const workers: Array<Promise<void>> = [];

    const runNext = async (): Promise<void> => {
      const id = ids[idx++];
      if (!id) return;
      try {
        await this.runAgentOnce({ agentName, scopeType, scopeId: id, window });
      } catch {
        // Continue processing other scopes, but fail the scheduled tick so drift isn't silent.
        errors++;
      }
      await runNext();
    };

    for (let i = 0; i < Math.min(concurrency, ids.length); i++) {
      workers.push(runNext());
    }
    await Promise.all(workers);

    if (errors > 0) {
      throw new Error(`Scheduled run completed with ${errors} failed scope(s).`);
    }
  }

  private getAgent(agentName: AgentName, sink: AlertSink) {
    if (agentName === 'ComplianceWatchdog') return new ComplianceWatchdog(sink);
    if (agentName === 'BoardIntelligenceOracle') return new BoardIntelligenceOracle(sink);
    if (agentName === 'FinancialSentinel') return new FinancialSentinel(sink);
    if (agentName === 'WorkerIncomeOptimizer') return new WorkerIncomeOptimizer(sink);
    return new GrantLifecycleManager(sink);
  }
}

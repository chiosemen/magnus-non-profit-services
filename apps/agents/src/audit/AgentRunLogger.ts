import type { AgentRunStatus } from '@magnus/db/types';
import { prisma } from '../db';
import type { AgentRunContext, AgentRunMetrics } from '../contracts/run';
import { redactErrorMessage } from '../security/redaction';
import type { Prisma } from '@magnus/db/types';

export class AgentRunLogger {
  async start(ctx: AgentRunContext): Promise<string> {
    const run = await prisma.agentRun.create({
      data: {
        agentName: ctx.agentName,
        scopeType: this.mapScopeType(ctx.scope.type),
        scopeId: ctx.scope.id,
        windowStart: ctx.window.start,
        windowEnd: ctx.window.end,
        status: 'STARTED',
        startedAt: new Date(),
        autonomyTier: ctx.autonomyTier ?? 'TIER_A_AUTONOMOUS',
        requiresHumanReview: ctx.requiresHumanReview ?? false,
        sourceRefs: ctx.sourceRefs === undefined ? undefined : (ctx.sourceRefs as Prisma.InputJsonValue),
      },
      select: { id: true },
    });
    return run.id;
  }

  async finishSuccess(runId: string, metrics: AgentRunMetrics): Promise<void> {
    const m = { ...(metrics as Record<string, unknown>) };
    const sourceRefs = m['sourceRefs'];
    delete m['sourceRefs'];
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'SUCCESS' satisfies AgentRunStatus,
        finishedAt: new Date(),
        metrics: m as Prisma.InputJsonValue,
        ...(sourceRefs !== undefined ? { sourceRefs: sourceRefs as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async finishFailed(runId: string, err: unknown, metrics: AgentRunMetrics): Promise<void> {
    const msg = redactErrorMessage(err);
    const m = { ...(metrics as Record<string, unknown>) };
    const sourceRefs = m['sourceRefs'];
    delete m['sourceRefs'];
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED' satisfies AgentRunStatus,
        finishedAt: new Date(),
        error: msg,
        metrics: m as Prisma.InputJsonValue,
        ...(sourceRefs !== undefined ? { sourceRefs: sourceRefs as Prisma.InputJsonValue } : {}),
      },
    });
  }

  private mapScopeType(scopeType: 'org' | 'worker' | 'grant') {
    if (scopeType === 'org') return 'ORG' as const;
    if (scopeType === 'worker') return 'WORKER' as const;
    return 'GRANT' as const;
  }
}

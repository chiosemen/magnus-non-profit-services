import { Prisma } from '@magnus/db/types';
import type { DbClient } from '../db';

export type MonthlyUsageSummary = {
  orgId: string;
  monthStart: Date;
  monthEnd: Date;
  tokenCount: number;
  costUsd: string;
};

export class UsageAuditService {
  private readonly db: DbClient;

  constructor(db: DbClient) {
    this.db = db;
  }

  async logUsage(params: {
    orgId: string;
    workerId?: string | null;
    promptType: string;
    tokenCount: number;
    costUsd: string | number;
    timestamp?: Date;
  }): Promise<void> {
    if (!params.orgId) throw new Error('ORG_ID_REQUIRED');
    if (!params.promptType) throw new Error('PROMPT_TYPE_REQUIRED');
    if (!Number.isFinite(params.tokenCount) || params.tokenCount < 0) throw new Error('TOKEN_COUNT_INVALID');

    const cost = new Prisma.Decimal(params.costUsd);
    const ts = params.timestamp ?? new Date();

    await this.db.claudeUsageLog.create({
      data: {
        orgId: params.orgId,
        workerId: params.workerId ?? null,
        promptType: params.promptType,
        tokenCount: Math.floor(params.tokenCount),
        cost,
        timestamp: ts,
      },
      select: { id: true },
    });
  }

  async getMonthlyUsage(orgId: string, at: Date = new Date()): Promise<MonthlyUsageSummary> {
    const { start, end } = monthWindowUtc(at);

    const agg = await this.db.claudeUsageLog.aggregate({
      where: { orgId, timestamp: { gte: start, lt: end } },
      _sum: { tokenCount: true, cost: true },
    });

    const tokenCount = agg._sum.tokenCount ?? 0;
    const cost = agg._sum.cost ? new Prisma.Decimal(agg._sum.cost as any) : new Prisma.Decimal(0);
    return {
      orgId,
      monthStart: start,
      monthEnd: end,
      tokenCount,
      costUsd: cost.toFixed(6),
    };
  }

  async enforceUsageCap(orgId: string, at: Date = new Date()): Promise<void> {
    const org = await this.db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, subscriptionTier: true, claudeStatus: true },
    });
    if (!org) throw new Error('ORG_NOT_FOUND');

    // STARTER: cap 0 => Claude disabled.
    if (org.subscriptionTier === 'STARTER') {
      throw new Error('CLAUDE_DISABLED_STARTER');
    }

    const cfg = await this.db.orgClaudeConfig.findUnique({
      where: { orgId },
      select: { enabled: true, monthlyTokenCap: true },
    });
    if (!cfg || !cfg.enabled) throw new Error('CLAUDE_NOT_ENABLED');

    const cap = cfg.monthlyTokenCap;
    if (!Number.isFinite(cap) || cap <= 0) throw new Error('USAGE_CAP_INVALID');

    const usage = await this.getMonthlyUsage(orgId, at);
    if (usage.tokenCount > cap) {
      // Fail-closed: suspend and throw.
      await this.db.organization.update({
        where: { id: orgId },
        data: { claudeStatus: 'SUSPENDED' },
        select: { id: true },
      });
      throw new Error('USAGE_CAP_EXCEEDED');
    }
  }
}

function monthWindowUtc(at: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}


import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runFinancialSentinelRules } from './rules';
import { computeCashRunway } from './cashRunway';
import { createPlaidClientFromEnv, lastNMonthsRange, type PlaidClient } from './plaidClient';

export class FinancialSentinel {
  private readonly sink: AlertSink;
  private readonly plaid: PlaidClient;

  constructor(sink: AlertSink, deps?: { plaidClient?: PlaidClient }) {
    this.sink = sink;
    this.plaid = deps?.plaidClient ?? createPlaidClientFromEnv();
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const orgId = ctx.scope.id;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, plaidAccessToken: true },
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

    const cashRunway = await this.tryComputeCashRunway({
      ctx,
      orgId: org.id,
      plaidAccessToken: org.plaidAccessToken ?? null,
    });
    if (cashRunway.alert) {
      await this.sink.emit(cashRunway.alert);
    }

    return {
      orgId: org.id,
      alertsEmitted: result.alerts.length + (cashRunway.alert ? 1 : 0),
      skippedRules: [...result.skippedRules, ...cashRunway.skippedRules],
      ...result.metrics,
      ...(cashRunway.metrics ?? {}),
      sourceRefs,
    };
  }

  private async tryComputeCashRunway(params: {
    ctx: AgentRunContext;
    orgId: string;
    plaidAccessToken: string | null;
  }): Promise<{
    alert: null | {
      agentName: AgentRunContext['agentName'];
      scopeType: AgentRunContext['scope']['type'];
      scopeId: string;
      severity: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
      type: string;
      title: string;
      body: string;
      recommendedActions: unknown;
      dedupeKey: string;
    };
    skippedRules: string[];
    metrics?: Record<string, unknown>;
  }> {
    const skippedRules: string[] = [];
    const { ctx, orgId, plaidAccessToken } = params;
    const asOf = ctx.window.end;
    if (!plaidAccessToken) {
      skippedRules.push('cash_runway:no_plaid_token');
      return { alert: null, skippedRules };
    }

    try {
      const { cashBalanceUsd } = await this.plaid.getCashBalance({ accessToken: plaidAccessToken });
      const range = lastNMonthsRange(3, asOf);
      const { totalInflowUsd, totalOutflowUsd } = await this.plaid.getTransactionsSummary({
        accessToken: plaidAccessToken,
        startDate: range.startDate,
        endDate: range.endDate,
      });

      const months = 3;
      const avgMonthlyNetUsd = (totalInflowUsd - totalOutflowUsd) / months;
      const runway = computeCashRunway({ cashBalanceUsd, avgMonthlyNetUsd });

      if (runway.runwayMonths === null) {
        skippedRules.push('cash_runway:not_burning_or_insufficient_data');
        return {
          alert: null,
          skippedRules,
          metrics: {
            cashBalanceUsd,
            avgMonthlyNetUsd,
          },
        };
      }

      const sev: 'LOW' | 'MED' | 'HIGH' =
        runway.runwayMonths < 2 ? 'HIGH' : runway.runwayMonths < 4 ? 'MED' : 'LOW';
      const alert =
        sev === 'LOW'
          ? null
          : {
              agentName: ctx.agentName,
              scopeType: ctx.scope.type,
              scopeId: orgId,
              severity: sev,
              type: 'CASH_RUNWAY_LOW',
              title: 'Cash runway appears low (heuristic)',
              body: [
                `As of ${asOf.toISOString().slice(0, 10)}, estimated cash balance is $${cashBalanceUsd.toFixed(2)} (Plaid balance rollup).`,
                `Estimated burn rate is ~$${(runway.burnRateUsdPerMonth ?? 0).toFixed(2)}/month based on last ${months} months of transactions.`,
                `Estimated runway is ~${runway.runwayMonths.toFixed(1)} months.`,
                '',
                'This is a heuristic for internal review only. Reconcile with authoritative accounting records before action.',
              ].join('\n'),
              recommendedActions: [
                'Confirm cash and burn assumptions in the accounting system.',
                'Identify near-term payable/receivable timing risks.',
                'Escalate to finance leadership for review-required decisions.',
              ],
              dedupeKey: `${ctx.agentName}:${ctx.scope.type}:${orgId}:CASH_RUNWAY_LOW:${asOf.toISOString()}`,
            };

      return {
        alert,
        skippedRules,
        metrics: {
          cashBalanceUsd,
          avgMonthlyNetUsd,
          runwayMonths: runway.runwayMonths,
        },
      };
    } catch {
      skippedRules.push('cash_runway:plaid_error');
      return { alert: null, skippedRules };
    }
  }
}

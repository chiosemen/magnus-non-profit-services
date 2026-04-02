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
      return {
        alert: {
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: orgId,
          severity: 'LOW',
          type: 'CASH_RUNWAY_UNAVAILABLE',
          title: 'Cash runway unavailable (Plaid not configured)',
          body: [
            `As of ${asOf.toISOString().slice(0, 10)}, cash runway could not be computed because Plaid is not configured for this org.`,
            '',
            'This is an internal visibility alert only. No external action was taken.',
            'Configure Plaid access token for the organization, then rerun FinancialSentinel.',
          ].join('\n'),
          recommendedActions: ['Configure Plaid and rerun FinancialSentinel.'],
          dedupeKey: `${ctx.agentName}:${ctx.scope.type}:${orgId}:CASH_RUNWAY_UNAVAILABLE:${asOf.toISOString()}`,
        },
        skippedRules,
      };
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
                `Inputs used (Plaid summaries): window ${range.startDate}..${range.endDate}, total_inflow=$${totalInflowUsd.toFixed(2)}, total_outflow=$${totalOutflowUsd.toFixed(2)}.`,
                '',
                'This is a heuristic for internal review only. It is not authoritative accounting. Reconcile with the accounting system before action.',
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
    } catch (err) {
      skippedRules.push('cash_runway:plaid_error');
      const code = err instanceof Error ? err.message : null;
      const reason = code === 'PLAID_MISCONFIGURED' ? 'PLAID_MISCONFIGURED' : 'PLAID_ERROR';
      return {
        alert: {
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: orgId,
          severity: 'LOW',
          type: 'CASH_RUNWAY_UNAVAILABLE',
          title: reason === 'PLAID_MISCONFIGURED' ? 'Cash runway unavailable (Plaid misconfigured)' : 'Cash runway unavailable (Plaid error)',
          body: [
            `As of ${asOf.toISOString().slice(0, 10)}, cash runway could not be computed due to a Plaid error.`,
            '',
            'This is an internal visibility alert only. No external action was taken.',
            reason === 'PLAID_MISCONFIGURED'
              ? 'PLAID_CLIENT_ID/PLAID_SECRET are missing. Configure Plaid credentials and rerun FinancialSentinel.'
              : 'Verify Plaid credentials/connectivity and rerun FinancialSentinel.',
          ].join('\n'),
          recommendedActions:
            reason === 'PLAID_MISCONFIGURED'
              ? ['Set PLAID_CLIENT_ID and PLAID_SECRET, then rerun FinancialSentinel.']
              : ['Verify Plaid connectivity and rerun FinancialSentinel.'],
          dedupeKey: `${ctx.agentName}:${ctx.scope.type}:${orgId}:CASH_RUNWAY_UNAVAILABLE:${asOf.toISOString()}`,
        },
        skippedRules,
      };
    }
  }
}

import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';

export type GrantPaceInput = {
  id: string;
  funderName: string;
  totalAmount: number;
  spentToDate: number;
  startDate: Date;
  endDate: Date;
};

export type SentinelInputs = {
  ctx: AgentRunContext;
  orgId: string;
  grants: GrantPaceInput[];
};

export function sentinelDedupeKey(params: {
  agentName: string;
  scopeType: string;
  scopeId: string;
  alertType: string;
  grantId?: string;
  windowEnd: Date;
}): string {
  const g = params.grantId ? `:${params.grantId}` : '';
  return `${params.agentName}:${params.scopeType}:${params.scopeId}:${params.alertType}${g}:${params.windowEnd.toISOString()}`;
}

/**
 * Conservative grant spend pace vs elapsed period. Not GAAP; for internal review only.
 */
export function runFinancialSentinelRules(inputs: SentinelInputs): {
  alerts: AlertEvent[];
  skippedRules: string[];
  metrics: Record<string, unknown>;
} {
  const { ctx, orgId } = inputs;
  const alerts: AlertEvent[] = [];
  const skippedRules: string[] = [];
  const asOf = ctx.window.end;

  for (const g of inputs.grants) {
    if (!(g.startDate instanceof Date) || Number.isNaN(g.startDate.getTime())) {
      skippedRules.push(`grant:${g.id}:invalid_dates`);
      continue;
    }
    if (!(g.endDate instanceof Date) || Number.isNaN(g.endDate.getTime())) {
      skippedRules.push(`grant:${g.id}:invalid_dates`);
      continue;
    }
    if (g.totalAmount <= 0) {
      skippedRules.push(`grant:${g.id}:non_positive_budget`);
      continue;
    }
    if (!Number.isFinite(g.spentToDate)) {
      skippedRules.push(`grant:${g.id}:invalid_spent`);
      continue;
    }
    if (g.spentToDate < 0) {
      skippedRules.push(`grant:${g.id}:negative_spent`);
      continue;
    }
    const periodMs = g.endDate.getTime() - g.startDate.getTime();
    if (periodMs <= 0) {
      skippedRules.push(`grant:${g.id}:invalid_period`);
      continue;
    }

    const elapsedMs = asOf.getTime() - g.startDate.getTime();
    if (elapsedMs <= 0) {
      skippedRules.push(`grant:${g.id}:not_started`);
      continue;
    }

    const timeRatio = Math.min(1, Math.max(0, elapsedMs / periodMs));
    const spendRatio = g.spentToDate / g.totalAmount;
    const daysToEnd = Math.ceil((g.endDate.getTime() - asOf.getTime()) / 86400000);

    // Only evaluate after 25% of period elapsed (avoid noisy first weeks).
    if (timeRatio < 0.25) {
      skippedRules.push(`grant:${g.id}:early_period`);
      continue;
    }

    const expectedFloor = timeRatio * 0.5;
    const expectedCeil = timeRatio * 1.15;

    // Restricted funds timing risk: grant is ending soon but spending is far behind time pace.
    // This is a heuristic to flag potential underspend/closeout risk for restricted funds.
    if (daysToEnd >= 0 && daysToEnd <= 60 && spendRatio < Math.max(0, timeRatio * 0.35)) {
      const gapPct = Math.max(0, (timeRatio - spendRatio) * 100);
      const sev = daysToEnd <= 30 || gapPct >= 40 ? 'HIGH' : 'MED';
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: orgId,
        severity: sev,
        type: 'RESTRICTED_FUNDS_TIMING_RISK',
        title: `Restricted funds timing risk — ${g.funderName}`,
        body: [
          `Grant ends in ~${daysToEnd} day(s) on ${g.endDate.toISOString().slice(0, 10)}.`,
          `As of ${asOf.toISOString().slice(0, 10)}, time elapsed is ${(timeRatio * 100).toFixed(0)}% but spend is ${(spendRatio * 100).toFixed(1)}%.`,
          `Inputs used (grant record snapshot): total=${g.totalAmount.toFixed(2)}, spent_to_date=${g.spentToDate.toFixed(2)}, start=${g.startDate.toISOString().slice(0, 10)}, end=${g.endDate.toISOString().slice(0, 10)}.`,
          'This is a conservative heuristic for restricted-fund timing / closeout risk. Verify with accounting and grant management.',
        ].join('\n'),
        recommendedActions: [
          'Reconcile actual spend vs the grant budget in the accounting system.',
          'Confirm allowable expenses, procurement lead times, and closeout requirements.',
          'If needed, evaluate no-cost extension options (human decision).',
        ],
        dedupeKey: sentinelDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: orgId,
          alertType: 'RESTRICTED_FUNDS_TIMING_RISK',
          grantId: g.id,
          windowEnd: ctx.window.end,
        }),
      });
    }

    if (spendRatio < expectedFloor) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: orgId,
        severity: spendRatio < timeRatio * 0.25 ? 'HIGH' : 'MED',
        type: 'GRANT_UNDERSPEND_PACE',
        title: `Grant spend pacing low — ${g.funderName}`,
        body: [
          `As of ${asOf.toISOString().slice(0, 10)}, about ${(timeRatio * 100).toFixed(0)}% of the grant period has elapsed.`,
          `Spend is ${(spendRatio * 100).toFixed(1)}% of the award (${g.spentToDate.toFixed(2)} / ${g.totalAmount.toFixed(2)}).`,
          `Inputs used (grant record snapshot): total=${g.totalAmount.toFixed(2)}, spent_to_date=${g.spentToDate.toFixed(2)}, start=${g.startDate.toISOString().slice(0, 10)}, end=${g.endDate.toISOString().slice(0, 10)}.`,
          'Restricted funds may be at risk of underspend or timing issues — confirm with finance.',
        ].join('\n'),
        recommendedActions: [
          'Review grant budget vs actuals in the finance system.',
          'Check reporting and no-cost extension options with the funder (human decision).',
        ],
        dedupeKey: sentinelDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: orgId,
          alertType: 'GRANT_UNDERSPEND_PACE',
          grantId: g.id,
          windowEnd: ctx.window.end,
        }),
      });
    } else if (spendRatio > expectedCeil) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: orgId,
        severity: spendRatio > 1 ? 'CRITICAL' : 'HIGH',
        type: 'GRANT_OVERSPEND_PACE',
        title: `Grant spend pacing high — ${g.funderName}`,
        body: [
          `As of ${asOf.toISOString().slice(0, 10)}, about ${(timeRatio * 100).toFixed(0)}% of the grant period has elapsed.`,
          `Spend is ${(spendRatio * 100).toFixed(1)}% of the award (${g.spentToDate.toFixed(2)} / ${g.totalAmount.toFixed(2)}).`,
          `Inputs used (grant record snapshot): total=${g.totalAmount.toFixed(2)}, spent_to_date=${g.spentToDate.toFixed(2)}, start=${g.startDate.toISOString().slice(0, 10)}, end=${g.endDate.toISOString().slice(0, 10)}.`,
          spendRatio > 1
            ? 'Spend exceeds the recorded award amount — verify data entry and encumbrances.'
            : 'Spend is ahead of linear pace — confirm projections and restrictions.',
        ].join('\n'),
        recommendedActions: [
          'Reconcile grant balance with authoritative accounting records.',
          'Escalate to finance before any external communication.',
        ],
        dedupeKey: sentinelDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: orgId,
          alertType: 'GRANT_OVERSPEND_PACE',
          grantId: g.id,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  return {
    alerts,
    skippedRules,
    metrics: {
      grantsInspected: inputs.grants.length,
      alertsRaised: alerts.length,
    },
  };
}

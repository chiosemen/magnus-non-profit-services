import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';

export type IncomeTx = {
  amount: number;
  transactionDate: Date;
  sourceOrgId: string | null;
};

export type TaxEstimate = {
  taxYear: number;
  quarter: number;
  estimatedFederal: number;
  estimatedState: number;
  paidFederal: number | null;
  paidState: number | null;
  dueDate: Date;
};

export type WorkerIncomeOptimizerInputs = {
  ctx: AgentRunContext;
  workerId: string;
  transactions90d: IncomeTx[];
  transactions180d: IncomeTx[];
  taxEstimates: TaxEstimate[];
};

export type WorkerIncomeOptimizerResult = {
  alerts: AlertEvent[];
  metrics: Record<string, unknown>;
};

export function workerDedupeKey(params: {
  agentName: string;
  scopeType: string;
  scopeId: string;
  alertType: string;
  windowEnd: Date;
}): string {
  return `${params.agentName}:${params.scopeType}:${params.scopeId}:${params.alertType}:${params.windowEnd.toISOString()}`;
}

export function monthlyVolatility(transactions: IncomeTx[], windowEnd: Date): { cv: number; monthlyTotals: number[] } {
  // Last 6 months inclusive of the month containing windowEnd.
  const buckets = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(windowEnd.getFullYear(), windowEnd.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, 0);
  }

  for (const tx of transactions) {
    const key = `${tx.transactionDate.getFullYear()}-${String(tx.transactionDate.getMonth() + 1).padStart(2, '0')}`;
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + tx.amount);
  }

  const monthlyTotals = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  const mean = monthlyTotals.reduce((s, v) => s + v, 0) / Math.max(1, monthlyTotals.length);
  if (mean === 0) return { cv: 0, monthlyTotals };
  const variance = monthlyTotals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / Math.max(1, monthlyTotals.length);
  const stdev = Math.sqrt(variance);
  return { cv: stdev / Math.abs(mean), monthlyTotals };
}

export function topSourcePct(transactions: IncomeTx[]): { topSourceOrgId: string | null; pct: number } {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  if (total <= 0) return { topSourceOrgId: null, pct: 0 };
  const bySource = new Map<string, number>();
  for (const t of transactions) {
    const key = t.sourceOrgId ?? 'UNKNOWN';
    bySource.set(key, (bySource.get(key) ?? 0) + t.amount);
  }
  let best: { k: string; v: number } | null = null;
  for (const [k, v] of bySource.entries()) {
    if (!best || v > best.v) best = { k, v };
  }
  const pct = best ? best.v / total : 0;
  return { topSourceOrgId: best?.k === 'UNKNOWN' ? null : (best?.k ?? null), pct };
}

export function runWorkerIncomeOptimizerRules(inputs: WorkerIncomeOptimizerInputs): WorkerIncomeOptimizerResult {
  const { ctx, workerId } = inputs;
  const alerts: AlertEvent[] = [];

  const totalIncome90d = inputs.transactions90d.reduce((s, t) => s + t.amount, 0);
  const { cv, monthlyTotals } = monthlyVolatility(inputs.transactions180d, ctx.window.end);
  const top = topSourcePct(inputs.transactions90d);

  const metrics: Record<string, unknown> = {
    workerId,
    totalIncome90d,
    volatility: cv,
    monthlyTotals,
    topSourcePct: top.pct,
    topSourceOrgId: top.topSourceOrgId,
  };

  // Safety: insufficient data (< 2 months with non-zero totals)
  const nonZeroMonths = monthlyTotals.filter(v => v > 0).length;
  if (nonZeroMonths < 2) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: workerId,
      severity: 'LOW',
      type: 'INSUFFICIENT_DATA',
      title: 'Insufficient income data for optimizer',
      body: 'Fewer than 2 months of income data are available in the last 6 months window.',
      recommendedActions: ['Connect income sources or import transactions to enable weekly analysis.'],
      dedupeKey: workerDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: workerId,
        alertType: 'INSUFFICIENT_DATA',
        windowEnd: ctx.window.end,
      }),
    });
    return { alerts, metrics };
  }

  // Rule 2: Income volatility
  if (cv > 0.30) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: workerId,
      severity: 'MED',
      type: 'INCOME_VOLATILITY',
      title: 'Income volatility detected',
      body: `Monthly income coefficient of variation over last 6 months is ${(cv * 100).toFixed(1)}% (> 30%).`,
      recommendedActions: ['Increase reserves and consider smoothing income streams.'],
      dedupeKey: workerDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: workerId,
        alertType: 'INCOME_VOLATILITY',
        windowEnd: ctx.window.end,
      }),
    });
  }

  // Rule 3: Client concentration
  if (top.pct > 0.60) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: workerId,
      severity: 'MED',
      type: 'CLIENT_CONCENTRATION',
      title: 'Client concentration risk',
      body: `Top income source contributes ${(top.pct * 100).toFixed(1)}% of income over last 90 days.`,
      recommendedActions: ['Diversify clients or income sources to reduce concentration risk.'],
      dedupeKey: workerDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: workerId,
        alertType: 'CLIENT_CONCENTRATION',
        windowEnd: ctx.window.end,
      }),
    });
  }

  // Rule 1: Tax shortfall (deterministic run-rate)
  // Project annualized income from 90d run rate.
  const annualIncomeProjection = totalIncome90d * (365 / 90);
  // Simplified deterministic tax model (engine lives elsewhere; here rule uses conservative approximation).
  const projectedFederal = annualIncomeProjection * 0.22;
  const projectedState = annualIncomeProjection * 0.05;
  const projectedTotal = projectedFederal + projectedState;

  const paidFederal = inputs.taxEstimates.reduce((s, e) => s + (e.paidFederal ?? 0), 0);
  const paidState = inputs.taxEstimates.reduce((s, e) => s + (e.paidState ?? 0), 0);
  const paidTotal = paidFederal + paidState;

  metrics['annualIncomeProjection'] = annualIncomeProjection;
  metrics['projectedFederal'] = projectedFederal;
  metrics['projectedState'] = projectedState;
  metrics['paidFederalYTD'] = paidFederal;
  metrics['paidStateYTD'] = paidState;

  if (paidTotal > 0 && projectedTotal > paidTotal * 1.2) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: workerId,
      severity: 'HIGH',
      type: 'TAX_SHORTFALL',
      title: 'Estimated tax shortfall risk',
      body: `Projected annual tax (${projectedTotal.toFixed(2)}) exceeds paid tax to date (${paidTotal.toFixed(2)}) by >20%.`,
      recommendedActions: ['Increase estimated payments and review withholding to avoid underpayment penalties.'],
      dedupeKey: workerDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: workerId,
        alertType: 'TAX_SHORTFALL',
        windowEnd: ctx.window.end,
      }),
    });
  }

  // Rule 4: Quarterly due reminders (within 14 days, unpaid)
  const now = ctx.window.end;
  const in14 = new Date(now.getTime() + 14 * 86400000);
  for (const e of inputs.taxEstimates) {
    if (e.dueDate.getTime() >= now.getTime() && e.dueDate.getTime() <= in14.getTime()) {
      const paid = (e.paidFederal ?? 0);
      if (paid < e.estimatedFederal) {
        alerts.push({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: workerId,
          severity: 'HIGH',
          type: 'QUARTERLY_TAX_DUE',
          title: 'Quarterly estimated tax due soon',
          body: `Quarter ${e.quarter} estimated federal due on ${e.dueDate.toISOString().slice(0, 10)} is not fully paid.`,
          recommendedActions: ['Submit payment before due date and record it in the system.'],
          dedupeKey: workerDedupeKey({
            agentName: ctx.agentName,
            scopeType: ctx.scope.type,
            scopeId: workerId,
            alertType: `QUARTERLY_TAX_DUE:${e.taxYear}:Q${e.quarter}`,
            windowEnd: ctx.window.end,
          }),
        });
      }
    }
  }

  return { alerts, metrics };
}


import { z } from 'zod';

export const AllowableSpendCategorySchema = z.object({
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(120),
}).strict();

export const RestrictedFundSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().min(1).max(200),
  sourceName: z.string().min(1).max(200),
  totalRestrictedAmountUsd: z.number().finite().positive().max(100_000_000),
  restrictionPurpose: z.string().min(10).max(2000),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allowableSpendCategories: z.array(AllowableSpendCategorySchema).max(50).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type RestrictedFund = z.infer<typeof RestrictedFundSchema>;

export const RestrictedFundUsageEventSchema = z.object({
  id: z.string().uuid(),
  restrictedFundId: z.string().uuid(),
  orgId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  amountUsd: z.number().finite().positive().max(100_000_000),
  categoryCode: z.string().min(1).max(50).optional(),
  memo: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
}).strict();

export type RestrictedFundUsageEvent = z.infer<typeof RestrictedFundUsageEventSchema>;

export type RestrictedFundRiskFlag =
  | 'OVERSPENT'
  | 'UNDERSPEND_RISK'
  | 'PERIOD_ENDED_WITH_REMAINING_BALANCE'
  | 'MISSING_PERIOD_DATES';

export const RestrictedFundComputedSchema = z.object({
  restrictedFundId: z.string().uuid(),
  totalRestrictedAmountUsd: z.number(),
  totalUsedUsd: z.number(),
  remainingBalanceUsd: z.number(),
  period: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    daysTotal: z.number().int(),
    daysElapsed: z.number().int(),
    daysRemaining: z.number().int(),
  }).strict(),
  spendRates: z.object({
    usedPerDayUsd: z.number(),
    requiredPerDayUsdToFullyUseByEnd: z.number(),
    projectedTotalUsedByEndUsd: z.number(),
  }).strict(),
  riskFlags: z.array(z.custom<RestrictedFundRiskFlag>()).default([]),
  explainability: z.array(z.string().min(1).max(240)).default([]),
}).strict();

export type RestrictedFundComputed = z.infer<typeof RestrictedFundComputedSchema>;

export function computeRestrictedFundStatus(params: {
  fund: Pick<RestrictedFund, 'id' | 'totalRestrictedAmountUsd' | 'startDate' | 'endDate'>;
  usageEvents: Array<Pick<RestrictedFundUsageEvent, 'amountUsd' | 'occurredAt'>>;
  nowIso?: string;
}): RestrictedFundComputed {
  const now = params.nowIso ? new Date(params.nowIso) : new Date();
  const start = new Date(params.fund.startDate);
  const end = new Date(params.fund.endDate);

  const explainability: string[] = [];
  const riskFlags: RestrictedFundRiskFlag[] = [];

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
    riskFlags.push('MISSING_PERIOD_DATES');
    return {
      restrictedFundId: params.fund.id,
      totalRestrictedAmountUsd: params.fund.totalRestrictedAmountUsd,
      totalUsedUsd: sumUsd(params.usageEvents),
      remainingBalanceUsd: params.fund.totalRestrictedAmountUsd - sumUsd(params.usageEvents),
      period: {
        startDate: params.fund.startDate,
        endDate: params.fund.endDate,
        daysTotal: 0,
        daysElapsed: 0,
        daysRemaining: 0,
      },
      spendRates: {
        usedPerDayUsd: 0,
        requiredPerDayUsdToFullyUseByEnd: 0,
        projectedTotalUsedByEndUsd: sumUsd(params.usageEvents),
      },
      riskFlags,
      explainability: ['Fund period dates are missing or invalid; pace/risk cannot be computed deterministically.'],
    };
  }

  const totalUsed = sumUsd(params.usageEvents);
  const remaining = round2(params.fund.totalRestrictedAmountUsd - totalUsed);

  const daysTotal = Math.max(1, daysBetween(start, end));
  const daysElapsed = clampInt(daysBetween(start, now), 0, daysTotal);
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  const usedPerDay = daysElapsed > 0 ? round2(totalUsed / daysElapsed) : 0;
  const requiredPerDay = daysRemaining > 0 ? round2(Math.max(remaining, 0) / daysRemaining) : 0;
  const projectedTotalUsedByEnd = round2(totalUsed + (usedPerDay * daysRemaining));

  explainability.push(`Total restricted: $${params.fund.totalRestrictedAmountUsd.toFixed(2)}`);
  explainability.push(`Total used (sum of usage events): $${totalUsed.toFixed(2)}`);
  explainability.push(`Remaining balance = total restricted - total used = $${remaining.toFixed(2)}`);
  explainability.push(`Used per day = total used / days elapsed = $${usedPerDay.toFixed(2)}`);
  explainability.push(`Projected total used by end = used so far + (used/day * days remaining) = $${projectedTotalUsedByEnd.toFixed(2)}`);

  if (remaining < 0) {
    riskFlags.push('OVERSPENT');
    explainability.push('Risk flag OVERSPENT because remaining balance is negative.');
  }

  if (daysRemaining === 0 && remaining > 0) {
    riskFlags.push('PERIOD_ENDED_WITH_REMAINING_BALANCE');
    explainability.push('Risk flag PERIOD_ENDED_WITH_REMAINING_BALANCE because period ended with remaining balance.');
  }

  // Under-spend risk: approaching end and projected to leave meaningful balance.
  if (daysRemaining > 0) {
    const remainingPct = params.fund.totalRestrictedAmountUsd > 0 ? remaining / params.fund.totalRestrictedAmountUsd : 0;
    if (daysRemaining <= 60 && remainingPct >= 0.25 && projectedTotalUsedByEnd < params.fund.totalRestrictedAmountUsd * 0.9) {
      riskFlags.push('UNDERSPEND_RISK');
      explainability.push('Risk flag UNDERSPEND_RISK because projected spend by end leaves >=10% unspent with <=60 days remaining.');
    }
  }

  return {
    restrictedFundId: params.fund.id,
    totalRestrictedAmountUsd: params.fund.totalRestrictedAmountUsd,
    totalUsedUsd: totalUsed,
    remainingBalanceUsd: remaining,
    period: {
      startDate: params.fund.startDate,
      endDate: params.fund.endDate,
      daysTotal,
      daysElapsed,
      daysRemaining,
    },
    spendRates: {
      usedPerDayUsd: usedPerDay,
      requiredPerDayUsdToFullyUseByEnd: requiredPerDay,
      projectedTotalUsedByEndUsd: projectedTotalUsedByEnd,
    },
    riskFlags,
    explainability,
  };
}

function sumUsd(events: Array<Pick<RestrictedFundUsageEvent, 'amountUsd'>>): number {
  return round2(events.reduce((s, e) => s + (Number.isFinite(e.amountUsd) ? e.amountUsd : 0), 0));
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}


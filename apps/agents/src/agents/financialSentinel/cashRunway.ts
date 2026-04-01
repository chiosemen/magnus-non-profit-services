export type CashRunwayInput = {
  cashBalanceUsd: number;
  avgMonthlyNetUsd: number; // positive means surplus; negative means burn
};

export type CashRunwayResult = {
  runwayMonths: number | null;
  burnRateUsdPerMonth: number | null;
};

export function computeCashRunway(input: CashRunwayInput): CashRunwayResult {
  const cash = Number.isFinite(input.cashBalanceUsd) ? input.cashBalanceUsd : NaN;
  const net = Number.isFinite(input.avgMonthlyNetUsd) ? input.avgMonthlyNetUsd : NaN;
  if (!Number.isFinite(cash) || cash < 0) return { runwayMonths: null, burnRateUsdPerMonth: null };
  if (!Number.isFinite(net)) return { runwayMonths: null, burnRateUsdPerMonth: null };

  // If not burning cash (net >= 0), runway is not meaningful.
  if (net >= 0) return { runwayMonths: null, burnRateUsdPerMonth: 0 };

  const burn = Math.abs(net);
  if (burn <= 0) return { runwayMonths: null, burnRateUsdPerMonth: null };
  return { runwayMonths: cash / burn, burnRateUsdPerMonth: burn };
}


/**
 * Minimal calculation helpers used across MCP Connector.
 * These functions are pure and defensive to keep behavior predictable.
 */

export function calculateGrowthRate(current: number, prior: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) return 0;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export function calculateCAGR(startValue: number, endValue: number, years: number): number {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || !Number.isFinite(years)) return 0;
  if (startValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

export function calculateVolatility(values: number[]): number {
  const nums = values.filter(v => Number.isFinite(v));
  if (nums.length < 2) return 0;
  const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
  const variance = nums.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (nums.length - 1);
  const stdev = Math.sqrt(variance);
  return mean === 0 ? 0 : (stdev / Math.abs(mean)) * 100;
}

export function calculateConcentrationRisk(percentages: number[]): number {
  // 0-100 score: higher means more concentrated (riskier).
  const p = percentages
    .filter(v => Number.isFinite(v))
    .map(v => (v <= 1 ? v * 100 : v))
    .map(v => Math.max(0, Math.min(100, v)));
  if (!p.length) return 0;
  // Herfindahl-Hirschman Index normalized to 0-100.
  const hhi = p.reduce((s, v) => s + Math.pow(v / 100, 2), 0); // 0-1
  return Math.max(0, Math.min(100, hhi * 100));
}

export function calculateProgramRatio(programExpenses: number, totalExpenses: number): number {
  if (!Number.isFinite(programExpenses) || !Number.isFinite(totalExpenses) || totalExpenses <= 0) return 0;
  return (programExpenses / totalExpenses) * 100;
}

export function calculateAdminRatio(adminExpenses: number, totalExpenses: number): number {
  if (!Number.isFinite(adminExpenses) || !Number.isFinite(totalExpenses) || totalExpenses <= 0) return 0;
  return (adminExpenses / totalExpenses) * 100;
}

export function calculateFundraisingROI(contributions: number, fundraisingExpenses: number): number {
  if (!Number.isFinite(contributions) || !Number.isFinite(fundraisingExpenses) || fundraisingExpenses <= 0) return 0;
  return contributions / fundraisingExpenses;
}

export function calculateMonthsOfReserves(netAssets: number, totalExpenses: number): number {
  if (!Number.isFinite(netAssets) || !Number.isFinite(totalExpenses) || totalExpenses <= 0) return 0;
  const monthly = totalExpenses / 12;
  return monthly <= 0 ? 0 : netAssets / monthly;
}

export function calculateFinancialHealthScore(metrics: {
  programRatio: number;
  monthsOfReserves: number;
  revenueGrowth?: number;
  netMargin?: number;
  // Additional inputs are accepted to avoid strict object-literal errors at call sites.
  adminRatio?: number;
  fundraisingRatio?: number;
  currentRatio?: number;
}): number {
  const program = clamp(metrics.programRatio, 0, 100);
  const reserves = clamp(metrics.monthsOfReserves, 0, 24); // cap at 24 months
  const growth = clamp(metrics.revenueGrowth ?? 0, -100, 100);
  const margin = clamp(metrics.netMargin ?? 0, -100, 100);

  // Simple weighted score. This is a heuristic, not policy.
  const score =
    (program * 0.4) +
    ((reserves / 24) * 100 * 0.25) +
    (((growth + 100) / 200) * 100 * 0.2) +
    (((margin + 100) / 200) * 100 * 0.15);

  return Math.round(clamp(score, 0, 100));
}

export function calculateGrantMatchScore(
  org: { nteeCode: string; state: string; annualBudget: number; focusAreas: string[] },
  opp: { eligibleNTEECodes: string[]; eligibleStates: string[]; minGrantAmount: number; maxGrantAmount: number; focusAreas: string[] }
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // NTEE match
  if (opp.eligibleNTEECodes?.includes(org.nteeCode)) {
    score += 35;
    reasons.push('NTEE code is eligible');
  } else {
    reasons.push('NTEE code may not be eligible');
  }

  // State match
  if (opp.eligibleStates?.includes(org.state)) {
    score += 25;
    reasons.push('State is eligible');
  } else {
    reasons.push('State may not be eligible');
  }

  // Budget vs grant size (soft check)
  const avgGrant = (opp.minGrantAmount + opp.maxGrantAmount) / 2;
  if (Number.isFinite(avgGrant) && avgGrant > 0 && org.annualBudget > 0) {
    const ratio = avgGrant / org.annualBudget;
    if (ratio <= 0.25) {
      score += 20;
      reasons.push('Grant size is reasonable relative to annual budget');
    } else if (ratio <= 0.5) {
      score += 10;
      reasons.push('Grant size is somewhat large relative to annual budget');
    } else {
      reasons.push('Grant size may be too large relative to annual budget');
    }
  }

  // Focus areas overlap
  const orgAreas = new Set((org.focusAreas ?? []).map(s => s.toLowerCase()));
  const overlap = (opp.focusAreas ?? []).filter(a => orgAreas.has(a.toLowerCase())).length;
  if (overlap > 0) {
    score += 20;
    reasons.push('Focus areas align');
  } else {
    reasons.push('Focus areas may not align');
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

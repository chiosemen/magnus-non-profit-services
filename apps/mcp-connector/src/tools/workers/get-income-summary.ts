/**
 * Magnus MCP Tool — get-income-summary
 * Monthly income/expense trend with volatility analysis and runway calculation
 */

import { z } from 'zod';
import FinancialService from '../../services/FinancialService';
import { formatCurrency } from '../../utils/formatters';

export const getIncomeSummarySchema = z.object({
  ein: z.string().min(9),
  months: z.number().int().min(1).max(60).default(12).describe('Number of months of history'),
  plaid_access_token: z.string().optional(),
});

export type GetIncomeSummaryInput = z.infer<typeof getIncomeSummarySchema>;

const service = new FinancialService();

export async function execute(input: GetIncomeSummaryInput): Promise<string> {
  const { ein, months, plaid_access_token } = getIncomeSummarySchema.parse(input);
  const summary = await service.getIncomeSummary(ein, months, plaid_access_token);

  const netPositive = summary.netIncome >= 0;
  const volatilityRating = summary.revenueVolatility < 10 ? 'Stable'
    : summary.revenueVolatility < 25 ? 'Moderate'
    : summary.revenueVolatility < 40 ? 'Volatile' : 'Highly Volatile';

  return JSON.stringify({
    ein,
    period: summary.period,
    summary: {
      total_revenue: formatCurrency(summary.totalRevenue),
      total_expenses: formatCurrency(summary.totalExpenses),
      net_income: formatCurrency(summary.netIncome),
      net_status: netPositive ? '✅ Surplus' : '🔴 Deficit',
      avg_monthly_revenue: formatCurrency(summary.averageMonthlyRevenue),
      avg_monthly_expenses: formatCurrency(summary.averageMonthlyExpenses),
    },
    stability: {
      volatility_pct: `${summary.revenueVolatility.toFixed(1)}%`,
      volatility_rating: volatilityRating,
      burn_rate: summary.burnRate ? formatCurrency(summary.burnRate) + '/month' : null,
      runway_months: summary.runwayMonths ?? null,
      cash_balance: summary.cashBalance ? formatCurrency(summary.cashBalance) : null,
    },
    monthly_trend: summary.monthly.map(m => ({
      month: m.month,
      revenue: formatCurrency(m.totalRevenue),
      expenses: formatCurrency(m.totalExpenses),
      net: formatCurrency(m.netIncome),
      cumulative_net: formatCurrency(m.cumulativeNet),
    })),
    insights: summary.insights,
    data_source: plaid_access_token ? 'Plaid (live bank data)' : 'Estimated from Form 990',
  }, null, 2);
}

export default { name: 'get-income-summary', schema: getIncomeSummarySchema, execute };

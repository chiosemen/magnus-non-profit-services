/**
 * Magnus MCP Tool — get-revenue-breakdown
 * Revenue stream analysis with concentration risk, diversification score.
 *
 * PRODUCTION CONTRACT:
 * - Requires a valid `plaid_access_token` from the org's Plaid onboarding.
 * - Returns DATA_SOURCE_NOT_CONFIGURED (503-equivalent) if token is absent.
 * - Never fabricates, estimates, or generates financial data.
 */

import { z } from 'zod';
import FinancialService, { DataSourceNotConfiguredError } from '../../services/FinancialService';
import { PlaidAPIError } from '../../utils/errors';
import { formatCurrency } from '../../utils/formatters';

export const getRevenueBreakdownSchema = z.object({
  ein: z.string().min(9).describe('EIN of the nonprofit'),
  tax_year: z.number().int().optional().describe('Tax year (defaults to most recent)'),
  plaid_access_token: z.string().optional().describe('Plaid access token from org Plaid onboarding'),
});

export type GetRevenueBreakdownInput = z.infer<typeof getRevenueBreakdownSchema>;

const service = new FinancialService();

export async function execute(input: GetRevenueBreakdownInput): Promise<string> {
  const { ein, tax_year, plaid_access_token } = getRevenueBreakdownSchema.parse(input);

  try {
    const breakdown = await service.getRevenueBreakdown(ein, tax_year, plaid_access_token);

    const riskColor = {
      low: '✅', moderate: '🟡', high: '🟠', critical: '🔴',
    }[breakdown.concentrationRiskRating];

    return JSON.stringify({
      ein,
      tax_year: breakdown.taxYear,
      total_revenue: formatCurrency(breakdown.totalRevenue),
      total_revenue_raw: breakdown.totalRevenue,
      diversification: {
        score: breakdown.diversificationScore,
        concentration_risk: `${breakdown.concentrationRisk.toFixed(1)}%`,
        risk_rating: `${riskColor} ${breakdown.concentrationRiskRating.toUpperCase()}`,
        recurring_revenue_pct: `${breakdown.recurringRevenuePercentage.toFixed(1)}%`,
      },
      revenue_streams: breakdown.streams.map(s => ({
        category: s.category,
        subcategory: s.subcategory ?? null,
        amount: formatCurrency(s.amount),
        amount_raw: s.amount,
        percentage: `${s.percentage.toFixed(1)}%`,
        prior_year: s.priorYearAmount ? formatCurrency(s.priorYearAmount) : null,
        growth: s.growthRate != null ? `${s.growthRate >= 0 ? '+' : ''}${s.growthRate.toFixed(1)}%` : null,
        is_restricted: s.isRestricted,
        is_recurring: s.isRecurring,
      })),
      insights: breakdown.insights,
      data_source: 'Plaid (live bank data)',
    }, null, 2);

  } catch (err) {
    if (err instanceof DataSourceNotConfiguredError) {
      return JSON.stringify({
        error: 'DATA_SOURCE_NOT_CONFIGURED',
        code: err.code,
        message: err.message,
        onboarding_action: 'Complete Plaid bank connection in Settings → Financial Integrations to enable live revenue data.',
        ein,
      }, null, 2);
    }
    if (err instanceof PlaidAPIError) {
      return JSON.stringify({
        error: 'PLAID_API_ERROR',
        message: 'Unable to retrieve revenue data from Plaid. Please retry or re-authenticate your bank connection.',
        ein,
      }, null, 2);
    }
    throw err;
  }
}

export default { name: 'get-revenue-breakdown', schema: getRevenueBreakdownSchema, execute };

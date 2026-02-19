/**
 * Magnus MCP Tool — get-filing-history
 * Returns 990 filing history for a nonprofit (up to 10 years)
 */

import { z } from 'zod';
import ComplianceService from '../../services/ComplianceService';
import { formatCurrency, formatDateShort } from '../../utils/formatters';

export const getFilingHistorySchema = z.object({
  ein: z.string().min(9).describe('Employer Identification Number (EIN) of the nonprofit'),
  years_back: z.number().int().min(1).max(10).default(5).describe('Number of years of history to retrieve'),
});

export type GetFilingHistoryInput = z.infer<typeof getFilingHistorySchema>;

const service = new ComplianceService();

export async function execute(input: GetFilingHistoryInput): Promise<string> {
  const { ein, years_back } = getFilingHistorySchema.parse(input);
  const history = await service.getFilingHistory(ein, years_back);

  if (!history.length) {
    return JSON.stringify({
      ein,
      message: 'No filing history found',
      filings: [],
    });
  }

  const formatted = history.map(f => ({
    tax_year: f.taxYear,
    form_type: f.formType,
    filing_date: f.filingDate ? formatDateShort(f.filingDate) : 'Unknown',
    tax_period_end: f.taxPeriodEnd,
    total_revenue: formatCurrency(f.totalRevenue),
    total_revenue_raw: f.totalRevenue,
    total_expenses: formatCurrency(f.totalExpenses),
    total_expenses_raw: f.totalExpenses,
    net_assets: formatCurrency(f.netAssets),
    net_assets_raw: f.netAssets,
    is_amended: f.isAmended,
    pdf_url: f.pdfUrl ?? null,
  }));

  const totalRevenueTrend = history.length > 1
    ? ((history[0]!.totalRevenue - history[history.length - 1]!.totalRevenue) / Math.abs(history[history.length - 1]!.totalRevenue) * 100).toFixed(1)
    : null;

  return JSON.stringify({
    ein,
    years_retrieved: history.length,
    years_requested: years_back,
    filings: formatted,
    trend: totalRevenueTrend ? {
      revenue_change_pct: totalRevenueTrend,
      direction: parseFloat(totalRevenueTrend) >= 0 ? 'growing' : 'declining',
      period: `${history[history.length - 1]!.taxYear}–${history[0]!.taxYear}`,
    } : null,
  }, null, 2);
}

export default { name: 'get-filing-history', schema: getFilingHistorySchema, execute };

/**
 * Magnus MCP Tool — get-expense-allocation
 * Expense breakdown by category with IRS benchmark comparisons.
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

export const getExpenseAllocationSchema = z.object({
  ein: z.string().min(9).describe('EIN of the nonprofit'),
  tax_year: z.number().int().optional(),
  plaid_access_token: z.string().optional().describe('Plaid access token from org Plaid onboarding'),
});

export type GetExpenseAllocationInput = z.infer<typeof getExpenseAllocationSchema>;

const service = new FinancialService();

export async function execute(input: GetExpenseAllocationInput): Promise<string> {
  const { ein, tax_year, plaid_access_token } = getExpenseAllocationSchema.parse(input);

  try {
    const allocation = await service.getExpenseAllocation(ein, tax_year, plaid_access_token);

    const programGrade = allocation.programRatio >= 80 ? 'A'
      : allocation.programRatio >= 70 ? 'B'
      : allocation.programRatio >= 65 ? 'C'
      : allocation.programRatio >= 55 ? 'D' : 'F';

    return JSON.stringify({
      ein,
      tax_year: allocation.taxYear,
      total_expenses: formatCurrency(allocation.totalExpenses),
      functional_allocation: {
        program: {
          amount: formatCurrency(allocation.programExpenses),
          percentage: `${allocation.programRatio.toFixed(1)}%`,
          grade: programGrade,
          benchmark: '≥75% (Excellence: ≥80%)',
          status: allocation.programRatio >= 75 ? '✅ Meets benchmark' : '⚠️ Below benchmark',
        },
        administration: {
          amount: formatCurrency(allocation.adminExpenses),
          percentage: `${allocation.adminRatio.toFixed(1)}%`,
          benchmark: '≤15%',
          status: allocation.adminRatio <= 15 ? '✅ Within benchmark' : '⚠️ Above benchmark',
        },
        fundraising: {
          amount: formatCurrency(allocation.fundraisingExpenses),
          percentage: `${allocation.fundraisingRatio.toFixed(1)}%`,
          benchmark: '≤10%',
          status: allocation.fundraisingRatio <= 10 ? '✅ Within benchmark' : '⚠️ Above benchmark',
        },
      },
      expense_categories: allocation.categories.map(c => ({
        category: c.category,
        program_area: c.programArea ?? null,
        amount: formatCurrency(c.amount),
        amount_raw: c.amount,
        percentage: `${c.percentage.toFixed(1)}%`,
        is_fixed: c.isFixed,
        benchmark: c.benchmarkPercentage ? `${c.benchmarkPercentage}%` : null,
        variance: c.varianceFromBenchmark != null
          ? `${c.varianceFromBenchmark >= 0 ? '+' : ''}${c.varianceFromBenchmark.toFixed(1)}%`
          : null,
      })),
      insights: allocation.insights,
      data_source: 'Plaid (live bank data)',
    }, null, 2);

  } catch (err) {
    if (err instanceof DataSourceNotConfiguredError) {
      return JSON.stringify({
        error: 'DATA_SOURCE_NOT_CONFIGURED',
        code: err.code,
        message: err.message,
        onboarding_action: 'Complete Plaid bank connection in Settings → Financial Integrations to enable live expense data.',
        ein,
      }, null, 2);
    }
    if (err instanceof PlaidAPIError) {
      return JSON.stringify({
        error: 'PLAID_API_ERROR',
        message: 'Unable to retrieve expense data from Plaid. Please retry or re-authenticate your bank connection.',
        ein,
      }, null, 2);
    }
    throw err;
  }
}

export default { name: 'get-expense-allocation', schema: getExpenseAllocationSchema, execute };

/**
 * Magnus MCP Tool — get-expense-allocation
 * Expense breakdown by category with IRS benchmark comparisons
 */

import { z } from 'zod';
import FinancialService from '../../services/FinancialService';
import { formatCurrency } from '../../utils/formatters';

export const getExpenseAllocationSchema = z.object({
  ein: z.string().min(9).describe('EIN of the nonprofit'),
  tax_year: z.number().int().optional(),
  plaid_access_token: z.string().optional(),
});

export type GetExpenseAllocationInput = z.infer<typeof getExpenseAllocationSchema>;

const service = new FinancialService();

export async function execute(input: GetExpenseAllocationInput): Promise<string> {
  const { ein, tax_year, plaid_access_token } = getExpenseAllocationSchema.parse(input);
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
    data_source: plaid_access_token ? 'Plaid (live bank data)' : 'IRS Form 990',
  }, null, 2);
}

export default { name: 'get-expense-allocation', schema: getExpenseAllocationSchema, execute };

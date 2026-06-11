import { z } from 'zod';
import { prisma } from '@magnus/db/client';
import { getIncomeExpenseReport } from '@magnus/org-autonomous-ops-context';

export const getIncomeExpenseSummarySchema = z.object({
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
  fundId: z.string().uuid().optional().describe('Filter by specific Fund UUID'),
});

export type GetIncomeExpenseSummaryInput = z.infer<typeof getIncomeExpenseSummarySchema>;

export async function execute(
  input: GetIncomeExpenseSummaryInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { startDate, endDate, fundId } = getIncomeExpenseSummarySchema.parse(input);
  const orgId = context.orgId;

  const options: { startDate?: string; endDate?: string; fundId?: string } = {};
  if (startDate) options.startDate = startDate;
  if (endDate) options.endDate = endDate;
  if (fundId) options.fundId = fundId;

  const result = await getIncomeExpenseReport(prisma as any, orgId, options);

  return JSON.stringify({
    orgId,
    startDate: startDate || null,
    endDate: endDate || null,
    fundId: fundId || null,
    report: result,
  }, null, 2);
}

export default { name: 'get-income-expense-summary', schema: getIncomeExpenseSummarySchema, execute };

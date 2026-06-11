import { z } from 'zod';
import { prisma } from '@magnus/db/client';
import { getFundBalanceReport } from '@magnus/org-autonomous-ops-context';

export const getFundBalancesSchema = z.object({
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
});

export type GetFundBalancesInput = z.infer<typeof getFundBalancesSchema>;

export async function execute(
  input: GetFundBalancesInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { startDate, endDate } = getFundBalancesSchema.parse(input);
  const orgId = context.orgId;

  const options: { startDate?: string; endDate?: string } = {};
  if (startDate) options.startDate = startDate;
  if (endDate) options.endDate = endDate;

  const result = await getFundBalanceReport(prisma as any, orgId, options);

  return JSON.stringify({
    orgId,
    startDate: startDate || null,
    endDate: endDate || null,
    fundBalances: result,
  }, null, 2);
}

export default { name: 'get-fund-balances', schema: getFundBalancesSchema, execute };

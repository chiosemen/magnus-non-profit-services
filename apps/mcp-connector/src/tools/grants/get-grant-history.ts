/**
 * Magnus MCP Tool — get-grant-history
 * Returns historical grants received from funders via Candid API
 */

import { z } from 'zod';
import GrantService from '../../services/GrantService';
import { formatCurrency } from '../../utils/formatters';

export const getGrantHistorySchema = z.object({
  ein: z.string().min(9).describe('EIN of the recipient nonprofit'),
  min_amount: z.number().optional().describe('Filter grants above this amount'),
  funder_name: z.string().optional().describe('Filter by funder name (partial match)'),
});

export type GetGrantHistoryInput = z.infer<typeof getGrantHistorySchema>;

const service = new GrantService();

export async function execute(input: GetGrantHistoryInput): Promise<string> {
  const { ein, min_amount, funder_name } = getGrantHistorySchema.parse(input);
  let history = await service.getGrantHistory(ein);

  if (min_amount) history = history.filter(g => g.grantAmount >= min_amount);
  if (funder_name) history = history.filter(g =>
    g.funderName.toLowerCase().includes(funder_name.toLowerCase())
  );

  const totalReceived = history.reduce((s, g) => s + g.grantAmount, 0);
  const byFunder = history.reduce<Record<string, number>>((acc, g) => {
    acc[g.funderName] = (acc[g.funderName] ?? 0) + g.grantAmount;
    return acc;
  }, {});
  const topFunders = Object.entries(byFunder)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, total: formatCurrency(amount), total_raw: amount }));

  const byYear = history.reduce<Record<number, number>>((acc, g) => {
    acc[g.grantYear] = (acc[g.grantYear] ?? 0) + g.grantAmount;
    return acc;
  }, {});

  return JSON.stringify({
    ein,
    total_grants: history.length,
    total_received: formatCurrency(totalReceived),
    total_received_raw: totalReceived,
    top_funders: topFunders,
    by_year: Object.entries(byYear)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .map(([year, amount]) => ({ year: parseInt(year), amount: formatCurrency(amount), amount_raw: amount })),
    renewal_opportunities: history.filter(g => g.renewalEligible).length,
    grants: history.map(g => ({
      funder: g.funderName,
      funder_ein: g.funderEIN ?? null,
      program: g.programName ?? 'General Support',
      amount: formatCurrency(g.grantAmount),
      amount_raw: g.grantAmount,
      year: g.grantYear,
      purpose: g.grantPurpose,
      multi_year: g.isMultiYear,
      renewal_eligible: g.renewalEligible,
    })),
  }, null, 2);
}

export default { name: 'get-grant-history', schema: getGrantHistorySchema, execute };

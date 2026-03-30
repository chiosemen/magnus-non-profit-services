/**
 * Magnus MCP Tool — get-grant-prospect-matches
 * Truthful, explainable first-pass grant prospect matching.
 *
 * Data basis:
 * - Uses Candid API grant opportunity search when configured (CANDID_API_KEY).
 * - Falls back to NOT_CONFIGURED / INSUFFICIENT_DATA when unable to rank truthfully.
 */

import { z } from 'zod';
import GrantService from '../../services/GrantService';
import {
  GrantProspectMatchRequestSchema,
  rankGrantProspects,
} from '@magnus/grants';

export const getGrantProspectMatchesSchema = GrantProspectMatchRequestSchema.extend({
  // Maintain a stable tool schema name at MCP boundary.
}).strict();

export type GetGrantProspectMatchesInput = z.infer<typeof getGrantProspectMatchesSchema>;

const service = new GrantService();

export async function execute(input: GetGrantProspectMatchesInput): Promise<string> {
  const parsed = getGrantProspectMatchesSchema.parse(input);

  if (!process.env['CANDID_API_KEY']) {
    return JSON.stringify({
      status: 'NOT_CONFIGURED',
      warnings: ['Candid grant data is not configured (missing CANDID_API_KEY).'],
      data_basis: { source: 'none', notes: 'Grant prospect matching requires real opportunity data to avoid misleading rankings.' },
      matches: [],
    }, null, 2);
  }

  // Fetch opportunity candidates from Candid using only real filters we can justify.
  const opps = await service.findOpportunities({
    nteeCode: parsed.org.nteeCode,
    state: parsed.org.state,
    annualBudget: parsed.org.annualBudgetUsd,
    focusAreas: [...(parsed.org.focusAreas ?? []), ...(parsed.program?.focusAreas ?? [])],
    ...(parsed.ask?.amountUsd ? { minGrantAmount: parsed.ask.amountUsd } : {}),
    maxResults: Math.max(parsed.maxResults * 2, 20),
  });

  // Convert GrantService matches into the normalized opportunity payload expected by ranker.
  const opportunities = opps.map(m => m.opportunity);
  const ranked = rankGrantProspects({
    input: parsed,
    opportunities,
  });

  return JSON.stringify(ranked, null, 2);
}

export default { name: 'get-grant-prospect-matches', schema: getGrantProspectMatchesSchema, execute };


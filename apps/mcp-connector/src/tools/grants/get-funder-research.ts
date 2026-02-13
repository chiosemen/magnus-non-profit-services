/**
 * Magnus MCP Tool — get-funder-research
 * Deep funder profile: giving patterns, priorities, deadlines, contact info
 */

import { z } from 'zod';
import GrantService from '../../services/GrantService';
import { formatCurrency } from '../../utils/formatters';

export const getFunderResearchSchema = z.object({
  funder_ein: z.string().min(9).describe('EIN of the foundation or funder'),
  include_recent_grants: z.boolean().default(true).describe('Include list of recent grants awarded'),
});

export type GetFunderResearchInput = z.infer<typeof getFunderResearchSchema>;

const service = new GrantService();

export async function execute(input: GetFunderResearchInput): Promise<string> {
  const { funder_ein, include_recent_grants } = getFunderResearchSchema.parse(input);
  const profile = await service.getFunderResearch(funder_ein);

  const strategyInsights: string[] = [];
  if (profile.hasLOIRequirement) {
    strategyInsights.push('Requires Letter of Inquiry — contact program officer before submitting LOI');
  }
  if (!profile.acceptsUnsolicited) {
    strategyInsights.push('⚠️ Does NOT accept unsolicited proposals — must be invited or submit LOI first');
  }
  if (profile.applicationCycle === 'rolling') {
    strategyInsights.push('Rolling deadline — apply when ready, but allow 90+ days for review');
  }
  if (profile.averageGrant > 100000) {
    strategyInsights.push(`High average grant (${formatCurrency(profile.averageGrant)}) — budget for multi-year commitment in proposal`);
  }

  const output: Record<string, unknown> = {
    ein: funder_ein,
    name: profile.name,
    type: profile.type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
    location: profile.location,
    financial_summary: {
      annual_giving: formatCurrency(profile.annualGiving),
      annual_giving_raw: profile.annualGiving,
      average_grant: formatCurrency(profile.averageGrant),
      average_grant_raw: profile.averageGrant,
      total_assets: formatCurrency(profile.totalAssets),
    },
    grantmaking: {
      accepts_unsolicited: profile.acceptsUnsolicited,
      loi_required: profile.hasLOIRequirement,
      application_cycle: profile.applicationCycle,
      deadlines: profile.deadlines.length ? profile.deadlines : ['Check funder website for current deadlines'],
    },
    focus_areas: profile.focusAreas,
    geographic_focus: profile.geographicFocus.length ? profile.geographicFocus : ['National'],
    ntee_focus: profile.nteeFocus,
    contact: {
      staff: profile.staffContact ?? 'Not publicly listed',
      website: profile.websiteUrl ?? 'Not available',
    },
    strategy_insights: strategyInsights,
    history: profile.grantingHistory.map(h => ({
      year: h.year,
      total_given: formatCurrency(h.totalGiven),
      grant_count: h.grantCount,
      avg_grant: formatCurrency(Math.round(h.totalGiven / Math.max(h.grantCount, 1))),
    })),
  };

  if (include_recent_grants && profile.recentGrants.length) {
    output['recent_grants'] = profile.recentGrants.map(g => ({
      recipient: g.recipient,
      amount: formatCurrency(g.amount),
      year: g.year,
      purpose: g.purpose,
    }));
  }

  return JSON.stringify(output, null, 2);
}

export default { name: 'get-funder-research', schema: getFunderResearchSchema, execute };

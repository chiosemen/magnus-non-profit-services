/**
 * Magnus MCP Tool — get-multi-org-profile
 * Cross-org dashboard: combined metrics, alerts, side-by-side comparison
 */

import { z } from 'zod';
import WorkerService from '../../services/WorkerService';
import { formatCurrency } from '../../utils/formatters';

export const getMultiOrgProfileSchema = z.object({
  user_id: z.string().describe('User ID to look up associated organizations'),
  eins: z.array(z.string()).optional().describe('Filter to specific EINs (default: all linked orgs)'),
  include_comparison: z.boolean().default(true),
});

export type GetMultiOrgProfileInput = z.infer<typeof getMultiOrgProfileSchema>;

const service = new WorkerService();

export async function execute(input: GetMultiOrgProfileInput): Promise<string> {
  const { user_id, eins, include_comparison } = getMultiOrgProfileSchema.parse(input);
  const profile = await service.getMultiOrgProfile(user_id, eins);

  const healthLabel = profile.combinedHealthScore >= 80 ? '✅ Excellent'
    : profile.combinedHealthScore >= 65 ? '🟢 Good'
    : profile.combinedHealthScore >= 50 ? '🟡 Adequate'
    : '🔴 Poor';

  const output: Record<string, unknown> = {
    user_id,
    org_count: profile.orgCount,
    portfolio_summary: {
      total_revenue: formatCurrency(profile.totalRevenue),
      total_net_assets: formatCurrency(profile.totalNetAssets),
      total_employees: profile.totalEmployees,
      combined_health_score: `${profile.combinedHealthScore}/100 — ${healthLabel}`,
    },
    alerts: profile.alerts.length
      ? profile.alerts.map(a => ({ severity: a.severity, org: a.orgName, message: a.message }))
      : [{ severity: 'info', message: 'No active alerts across all organizations' }],
    organizations: profile.organizations.map(o => ({
      ein: o.ein,
      name: o.orgName,
      location: `${o.city}, ${o.state}`,
      tax_year: o.taxYear,
      revenue: formatCurrency(o.totalRevenue),
      net_assets: formatCurrency(o.netAssets),
      employees: o.employeeCount,
      program_ratio: `${o.programRatio.toFixed(1)}%`,
      health_score: `${o.healthScore}/100`,
      filing_status: o.filingStatus === 'overdue' ? '🔴 OVERDUE' : o.filingStatus === 'pending' ? '🟡 PENDING' : '✅ Current',
      last_synced: o.lastSynced,
    })),
    last_updated: profile.lastUpdated,
  };

  if (include_comparison && profile.comparisonMetrics.length) {
    output['comparison'] = profile.comparisonMetrics.map(m => ({
      metric: m.metric,
      insight: m.insight,
      rankings: m.values
        .sort((a, b) => b.value - a.value)
        .map((v, i) => ({ rank: i + 1, org: v.orgName, value: v.formatted })),
    }));
  }

  return JSON.stringify(output, null, 2);
}

export default { name: 'get-multi-org-profile', schema: getMultiOrgProfileSchema, execute };

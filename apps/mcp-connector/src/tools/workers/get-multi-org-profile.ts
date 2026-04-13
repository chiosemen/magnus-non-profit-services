/**
 * Magnus MCP Tool — get-multi-org-profile
 * Cross-org dashboard: combined metrics, alerts, side-by-side comparison.
 *
 * PRODUCTION CONTRACT:
 * - Returns NOT_FOUND (404-equivalent) when no orgs are registered for the user.
 * - Never falls back to hardcoded seed org data.
 * - WorkerService.getSeedOrgs has been DELETED — callers see NotFoundError.
 */

import { z } from 'zod';
import WorkerService from '../../services/WorkerService';
import { NotFoundError } from '../../utils/errors';
import { formatCurrency } from '../../utils/formatters';

export const getMultiOrgProfileSchema = z.object({
  eins: z.array(z.string()).optional().describe('Filter to specific EINs (default: all linked orgs)'),
  include_comparison: z.boolean().default(true),
});

export type GetMultiOrgProfileInput = z.infer<typeof getMultiOrgProfileSchema>;

const service = new WorkerService();

export async function execute(
  input: GetMultiOrgProfileInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { eins, include_comparison } = getMultiOrgProfileSchema.parse(input);
  const user_id = context.userId;

  try {
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

  } catch (err) {
    if (err instanceof NotFoundError) {
      return JSON.stringify({
        error: 'NOT_FOUND',
        code: err.code,
        message: err.message,
        onboarding_action:
          'No organizations are registered for this user. ' +
          'Add organizations via the Magnus dashboard before using this tool.',
        user_id,
      }, null, 2);
    }
    throw err;
  }
}

export default { name: 'get-multi-org-profile', schema: getMultiOrgProfileSchema, execute };

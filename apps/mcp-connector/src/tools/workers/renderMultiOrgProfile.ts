/**
 * Pure output shaping for get-multi-org-profile (P0-4, SPEC-P0 R4).
 *
 * Renders null-with-provenance profile fields honestly:
 * - null stays null in the JSON (never a formatted stand-in value),
 * - a filing status of null renders as UNAVAILABLE — the previous ternary
 *   rendered every non-overdue/non-pending status (including the fabricated
 *   'unknown') as "✅ Current",
 * - the health label is only computed when a real health score exists,
 * - every payload carries the provenance block naming the data source and
 *   the unavailable fields/aggregates.
 *
 * Kept free of service/db imports so it is unit-testable without Prisma.
 */

import type { MultiOrgProfile } from '../../services/workerProfileMapper';

export const FIELD_UNAVAILABLE = 'unavailable — no connected data source';

function filingStatusLabel(status: 'current' | 'overdue' | 'pending' | null): string {
  switch (status) {
    case 'overdue':
      return '🔴 OVERDUE';
    case 'pending':
      return '🟡 PENDING';
    case 'current':
      return '✅ Current';
    case null:
      return FIELD_UNAVAILABLE;
  }
}

function healthLabel(score: number): string {
  if (score >= 80) return '✅ Excellent';
  if (score >= 65) return '🟢 Good';
  if (score >= 50) return '🟡 Adequate';
  return '🔴 Poor';
}

export function renderMultiOrgProfile(params: {
  profile: MultiOrgProfile;
  userId: string;
  includeComparison: boolean;
  formatCurrency: (n: number) => string;
}): Record<string, unknown> {
  const { profile, userId, includeComparison, formatCurrency } = params;

  const output: Record<string, unknown> = {
    user_id: userId,
    org_count: profile.orgCount,
    portfolio_summary: {
      total_revenue: profile.totalRevenue !== null ? formatCurrency(profile.totalRevenue) : null,
      total_net_assets: profile.totalNetAssets !== null ? formatCurrency(profile.totalNetAssets) : null,
      total_employees: profile.totalEmployees,
      combined_health_score:
        profile.combinedHealthScore !== null
          ? `${profile.combinedHealthScore}/100 — ${healthLabel(profile.combinedHealthScore)}`
          : null,
    },
    alerts: profile.alerts.length
      ? profile.alerts.map(a => ({ severity: a.severity, org: a.orgName, message: a.message }))
      : [{ severity: 'info', message: 'No active alerts across all organizations' }],
    organizations: profile.organizations.map(o => ({
      ein: o.ein,
      name: o.orgName,
      location: o.city !== null && o.state !== null ? `${o.city}, ${o.state}` : null,
      tax_year: o.taxYear,
      revenue: o.totalRevenue !== null ? formatCurrency(o.totalRevenue) : null,
      net_assets: o.netAssets !== null ? formatCurrency(o.netAssets) : null,
      employees: o.employeeCount,
      program_ratio: o.programRatio !== null ? `${o.programRatio.toFixed(1)}%` : null,
      health_score: o.healthScore !== null ? `${o.healthScore}/100` : null,
      filing_status: filingStatusLabel(o.filingStatus),
      last_synced: o.lastSynced,
      data_provenance: {
        source: o.provenance.source,
        unavailable_fields: o.provenance.unavailableFields,
      },
    })),
    data_provenance: {
      source: profile.provenance.source,
      revenue_orgs_included: `${profile.provenance.revenueOrgsIncluded} of ${profile.provenance.orgCount}`,
      unavailable_aggregates: profile.provenance.unavailableAggregates,
      note:
        'null means no connected data source tracks this value. ' +
        'Values are never estimated or defaulted.',
    },
    last_updated: profile.lastUpdated,
  };

  if (includeComparison && profile.comparisonMetrics.length) {
    output['comparison'] = profile.comparisonMetrics.map(m => ({
      metric: m.metric,
      insight: m.insight,
      rankings: m.values
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((v, i) => ({ rank: i + 1, org: v.orgName, value: v.formatted })),
    }));
  }

  return output;
}

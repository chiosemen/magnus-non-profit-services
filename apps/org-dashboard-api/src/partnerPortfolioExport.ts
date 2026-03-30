import type { PartnerPortfolioOrgRow } from './partnerPortfolioService';

export type PortfolioExportSortMode = 'default' | 'program';

/** Parse `sort=program` for export (optional cohort/program grouping order). */
export function parsePortfolioExportSort(q: Record<string, unknown>): PortfolioExportSortMode {
  const v = q['sort'];
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s === 'string' && s.trim().toLowerCase() === 'program') return 'program';
  return 'default';
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'boolean'
        ? value
          ? 'true'
          : 'false'
        : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** Stable column order for institutional portfolio CSV (truthful fields only). */
export const PORTFOLIO_CSV_HEADERS = [
  'program_id',
  'program_label',
  'cohort_label',
  'membership_id',
  'org_id',
  'org_name',
  'ein',
  'subscription_tier',
  'subscription_status',
  'membership_active',
  'partner_notes',
  'partner_tags',
  'governance_complete',
  'governance_issue_count',
  'governance_completion_rate',
  'state_reg_tracked_states',
  'state_reg_solicitation_states',
  'state_reg_active_states',
  'state_reg_pending_states',
  'state_reg_missing_registration_states',
  'state_reg_overdue_renewals',
  'state_reg_unknown_states',
  'state_reg_high_risk_states',
  'audit_prep_overall_status',
  'audit_prep_open_items',
  'audit_prep_blocked_items',
  'audit_prep_overdue_items',
  'audit_prep_total_items',
  'portfolio_disclaimer',
] as const;

export function sortPartnerPortfolioRowsForExport(
  rows: PartnerPortfolioOrgRow[],
  mode: PortfolioExportSortMode
): PartnerPortfolioOrgRow[] {
  if (mode !== 'program') return [...rows];
  return [...rows].sort((a, b) => {
    const pa = a.programLabel ?? '';
    const pb = b.programLabel ?? '';
    if (pa !== pb) {
      if (!pa) return 1;
      if (!pb) return -1;
      return pa.localeCompare(pb);
    }
    const na = a.name.localeCompare(b.name);
    if (na !== 0) return na;
    return a.orgId.localeCompare(b.orgId);
  });
}

function rowToCsvLine(row: PartnerPortfolioOrgRow, disclaimer: string): string {
  const s = row.stateRegistrations.summary;
  const cells = [
    csvCell(row.programId),
    csvCell(row.programLabel),
    csvCell(row.cohortLabel),
    csvCell(row.membershipId),
    csvCell(row.orgId),
    csvCell(row.name),
    csvCell(row.ein),
    csvCell(row.subscriptionTier),
    csvCell(row.subscriptionStatus),
    csvCell(row.isActive),
    csvCell(row.partnerNotes),
    csvCell(row.partnerTags.join(';')),
    csvCell(row.governance.complete),
    csvCell(row.governance.issueCount),
    csvCell(row.governance.completionRate),
    csvCell(s.trackedStates),
    csvCell(s.solicitationStates),
    csvCell(s.activeStates),
    csvCell(s.pendingStates),
    csvCell(s.missingRegistrationStates),
    csvCell(s.overdueRenewals),
    csvCell(s.unknownStates),
    csvCell(s.highRiskStates),
    csvCell(row.auditPrep.overallStatus),
    csvCell(row.auditPrep.openItems),
    csvCell(row.auditPrep.blockedItems),
    csvCell(row.auditPrep.overdueItems),
    csvCell(row.auditPrep.totalItems),
    csvCell(disclaimer),
  ];
  return cells.join(',');
}

/**
 * Build UTF-8 CSV (optional BOM for Excel). One row per organization; includes portfolio_disclaimer per row.
 */
export function partnerPortfolioRowsToCsv(
  rows: PartnerPortfolioOrgRow[],
  disclaimer: string,
  opts?: { includeBom?: boolean }
): string {
  const lines = [PORTFOLIO_CSV_HEADERS.join(','), ...rows.map(r => rowToCsvLine(r, disclaimer))];
  const body = lines.join('\r\n');
  return opts?.includeBom === true ? `\uFEFF${body}` : body;
}

export function partnerPortfolioExportFilename(partnerId: string, exportedAt: Date): string {
  const y = exportedAt.getUTCFullYear();
  const m = String(exportedAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(exportedAt.getUTCDate()).padStart(2, '0');
  const prefix = partnerId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8) || 'partner';
  return `partner-portfolio-${prefix}-${y}${m}${d}.csv`;
}

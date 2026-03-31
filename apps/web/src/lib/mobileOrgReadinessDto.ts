/**
 * Pure mappers from org-dashboard-api JSON payloads to compact mobile read-only DTOs.
 * No network calls; safe to unit test.
 */

export type SectionState<T> =
  | { available: true; data: T }
  | { available: false; reason: 'forbidden' | 'upstream_error' | 'invalid_payload'; message: string };

export type OrgSummaryMobile = {
  id: string;
  ein: string;
  name: string;
  subscriptionTier: string;
  complianceItemCount: number;
  grantCount: number;
};

export type ComplianceSummaryMobile = {
  itemCount: number;
  nextDueDate: string | null;
};

export type GovernanceSummaryMobile = {
  boardMembersCount: number;
  complete: boolean;
  completionRate: number;
  issueCount: number;
  totalChecks: number;
};

export type RestrictedFundsSummaryMobile = {
  fundCount: number;
  totalRestrictedAmountUsd: number;
};

export type AuditPrepSummaryMobile = {
  overallStatus: string;
  totalItems: number;
  openItems: number;
  blockedItems: number;
  overdueItems: number;
  disclaimer: string;
};

export type MobileOrgReadinessPayload = {
  org: SectionState<OrgSummaryMobile>;
  compliance: SectionState<ComplianceSummaryMobile>;
  governance: SectionState<GovernanceSummaryMobile>;
  restrictedFunds: SectionState<RestrictedFundsSummaryMobile>;
  auditPrep: SectionState<AuditPrepSummaryMobile>;
  caveat: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Map GET /api/org/overview JSON body `{ organization }`. */
export function mapOverviewToMobile(orgPayload: unknown): OrgSummaryMobile | null {
  if (!isRecord(orgPayload)) return null;
  const org = orgPayload['organization'];
  if (!isRecord(org)) return null;
  const id = org['id'];
  const ein = org['ein'];
  const name = org['name'];
  const subscriptionTier = org['subscriptionTier'];
  const counts = org['_count'];
  if (typeof id !== 'string' || typeof ein !== 'string' || typeof name !== 'string' || typeof subscriptionTier !== 'string') {
    return null;
  }
  let complianceItemCount = 0;
  let grantCount = 0;
  if (isRecord(counts)) {
    const cc = counts['complianceCalendar'];
    const g = counts['grants'];
    if (typeof cc === 'number') complianceItemCount = cc;
    if (typeof g === 'number') grantCount = g;
  }
  return {
    id,
    ein,
    name,
    subscriptionTier,
    complianceItemCount,
    grantCount,
  };
}

/** Map GET /api/org/compliance JSON `{ complianceCalendar: [...] }`. */
export function mapComplianceToMobile(body: unknown): ComplianceSummaryMobile | null {
  if (!isRecord(body)) return null;
  const cal = body['complianceCalendar'];
  if (!Array.isArray(cal)) return null;
  const dates: number[] = [];
  for (const item of cal) {
    if (!isRecord(item)) continue;
    const due = item['dueDate'];
    if (typeof due === 'string') {
      const t = Date.parse(due);
      if (Number.isFinite(t)) dates.push(t);
    }
  }
  dates.sort((a, b) => a - b);
  const now = Date.now();
  const upcoming = dates.filter(d => d >= now);
  const nextDueDate = upcoming.length > 0 ? new Date(upcoming[0]!).toISOString().slice(0, 10) : null;
  return {
    itemCount: cal.length,
    nextDueDate,
  };
}

/** Map GET /api/org/governance JSON (snapshot). */
export function mapGovernanceToMobile(body: unknown): GovernanceSummaryMobile | null {
  if (!isRecord(body)) return null;
  const members = body['boardMembers'];
  const readiness = body['readiness'];
  if (!Array.isArray(members) || !isRecord(readiness)) return null;
  const complete = readiness['complete'];
  const completionRate = readiness['completionRate'];
  const issueCount = readiness['issueCount'];
  const totalChecks = readiness['totalChecks'];
  if (typeof complete !== 'boolean' || typeof completionRate !== 'number' || typeof issueCount !== 'number' || typeof totalChecks !== 'number') {
    return null;
  }
  return {
    boardMembersCount: members.length,
    complete,
    completionRate,
    issueCount,
    totalChecks,
  };
}

/** Map GET /api/org/restricted-funds JSON `{ restrictedFunds: [...] }`. */
export function mapRestrictedFundsToMobile(body: unknown): RestrictedFundsSummaryMobile | null {
  if (!isRecord(body)) return null;
  const funds = body['restrictedFunds'];
  if (!Array.isArray(funds)) return null;
  let totalRestrictedAmountUsd = 0;
  for (const f of funds) {
    if (!isRecord(f)) continue;
    const amt = f['totalRestrictedAmountUsd'];
    if (typeof amt === 'number' && Number.isFinite(amt)) totalRestrictedAmountUsd += amt;
  }
  return {
    fundCount: funds.length,
    totalRestrictedAmountUsd,
  };
}

/** Map GET /api/org/audit-prep JSON (snapshot). */
export function mapAuditPrepToMobile(body: unknown): AuditPrepSummaryMobile | null {
  if (!isRecord(body)) return null;
  const summary = body['summary'];
  const disclaimer = body['disclaimer'];
  if (!isRecord(summary) || typeof disclaimer !== 'string') return null;
  const overallStatus = summary['overallStatus'];
  const totalItems = summary['totalItems'];
  const openItems = summary['openItems'];
  const blockedItems = summary['blockedItems'];
  const overdueItems = summary['overdueItems'];
  if (
    typeof overallStatus !== 'string' ||
    typeof totalItems !== 'number' ||
    typeof openItems !== 'number' ||
    typeof blockedItems !== 'number' ||
    typeof overdueItems !== 'number'
  ) {
    return null;
  }
  return {
    overallStatus,
    totalItems,
    openItems,
    blockedItems,
    overdueItems,
    disclaimer,
  };
}

export const MOBILE_READINESS_CAVEAT =
  'Mobile v1 shows read-only summaries from your organization’s trackers. It is not a full web dashboard, not all features appear here, and nothing can be edited in this app.';

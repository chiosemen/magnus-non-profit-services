import React from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';

export const runtime = 'nodejs';

/** Base URL for org-dashboard-api; in dev use ORG_DASHBOARD_API_URL or http://localhost:4010 when unset. */
function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

/** Mirrors org-dashboard-api StateRegistrationSummary (portfolio row payload). */
type StateRegistrationSummary = {
  trackedStates: number;
  solicitationStates: number;
  activeStates: number;
  pendingStates: number;
  missingRegistrationStates: number;
  overdueRenewals: number;
  unknownStates: number;
  highRiskStates: number;
};

/** Mirrors PartnerPortfolioOrgRow from partnerPortfolioService. */
type PortfolioRow = {
  membershipId: string;
  orgId: string;
  name: string;
  ein: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  programId: string | null;
  programLabel: string | null;
  cohortLabel: string | null;
  isActive: boolean;
  partnerNotes: string | null;
  partnerTags: string[];
  governance: {
    complete: boolean;
    issueCount: number;
    completionRate: number;
  };
  stateRegistrations: { summary: StateRegistrationSummary };
  auditPrep: {
    overallStatus: string;
    openItems: number;
    blockedItems: number;
    overdueItems: number;
    totalItems: number;
  };
};

type PortfolioSummary = {
  partnerId: string;
  disclaimer: string;
  organizations: PortfolioRow[];
  filtersApplied: Record<string, unknown>;
  resultCount: number;
};

function buildSummaryQuery(searchParams: Record<string, string | string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, raw] of Object.entries(searchParams)) {
    if (raw === undefined) continue;
    if (Array.isArray(raw)) raw.forEach(v => qs.append(k, v));
    else qs.set(k, raw);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function mergeSearchParams(
  base: Record<string, string | string[] | undefined>,
  patch: Record<string, string | undefined>
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

function portfolioPathWithParams(
  selfBase: string,
  baseParams: Record<string, string | string[] | undefined>,
  patch: Record<string, string | undefined>
): string {
  const q = buildSummaryQuery(mergeSearchParams(baseParams, patch));
  return `${selfBase}/dashboard/partner/portfolio${q}`;
}

function isHighRiskOrOverdue(row: PortfolioRow): boolean {
  const s = row.stateRegistrations.summary;
  if (s.overdueRenewals > 0) return true;
  if (s.highRiskStates > 0) return true;
  if (s.missingRegistrationStates > 0) return true;
  if (row.auditPrep.overallStatus === 'overdue' || row.auditPrep.overallStatus === 'blocked') return true;
  if (row.auditPrep.overdueItems > 0 || row.auditPrep.blockedItems > 0) return true;
  if (!row.governance.complete) return true;
  return false;
}

function riskSignals(row: PortfolioRow): string[] {
  const out: string[] = [];
  const s = row.stateRegistrations.summary;
  if (row.auditPrep.overallStatus === 'blocked' || row.auditPrep.blockedItems > 0) {
    out.push(
      row.auditPrep.blockedItems > 0
        ? `Audit prep: blocked (${row.auditPrep.blockedItems} blocked)`
        : 'Audit prep: status blocked'
    );
  }
  if (row.auditPrep.overallStatus === 'overdue' || row.auditPrep.overdueItems > 0) {
    out.push(
      row.auditPrep.overdueItems > 0
        ? `Audit prep: overdue (${row.auditPrep.overdueItems} overdue)`
        : 'Audit prep: status overdue'
    );
  }
  if (s.overdueRenewals > 0) out.push(`State registrations: ${s.overdueRenewals} overdue renewal(s)`);
  if (!row.governance.complete) out.push(`Governance: incomplete (${row.governance.issueCount} issue(s))`);
  if (s.highRiskStates > 0) out.push(`State tracker: ${s.highRiskStates} high-risk state(s)`);
  if (s.missingRegistrationStates > 0) {
    out.push(`State tracker: ${s.missingRegistrationStates} missing registration state(s)`);
  }
  return out;
}

function riskSortScore(row: PortfolioRow): number {
  const s = row.stateRegistrations.summary;
  let k = 0;
  if (row.auditPrep.overallStatus === 'blocked' || row.auditPrep.blockedItems > 0) k += 1_000_000;
  if (row.auditPrep.overallStatus === 'overdue' || row.auditPrep.overdueItems > 0) k += 500_000;
  if (s.overdueRenewals > 0) k += 200_000;
  if (!row.governance.complete) k += 100_000;
  if (s.highRiskStates > 0) k += 50_000;
  if (s.missingRegistrationStates > 0) k += 25_000;
  return k;
}

function buildRollups(orgs: PortfolioRow[]) {
  let govComplete = 0;
  let govIncomplete = 0;
  const auditByStatus = new Map<string, number>();
  const subByStatus = new Map<string, number>();
  const programBuckets = new Map<string, { count: number; programId: string | null }>();
  const cohortBuckets = new Map<string, number>();

  for (const row of orgs) {
    if (row.governance.complete) govComplete += 1;
    else govIncomplete += 1;

    const a = row.auditPrep.overallStatus;
    auditByStatus.set(a, (auditByStatus.get(a) ?? 0) + 1);

    const sub = row.subscriptionStatus;
    subByStatus.set(sub, (subByStatus.get(sub) ?? 0) + 1);

    const pLabel = row.programLabel?.trim() || 'Unassigned';
    const existing = programBuckets.get(pLabel);
    if (existing) existing.count += 1;
    else programBuckets.set(pLabel, { count: 1, programId: row.programId });

    const cLabel = row.cohortLabel?.trim() || 'Unassigned';
    cohortBuckets.set(cLabel, (cohortBuckets.get(cLabel) ?? 0) + 1);
  }

  return {
    govComplete,
    govIncomplete,
    auditByStatus: [...auditByStatus.entries()].sort((a, b) => b[1] - a[1]),
    subByStatus: [...subByStatus.entries()].sort((a, b) => b[1] - a[1]),
    programBuckets: [...programBuckets.entries()].sort((a, b) => b[1].count - a[1].count),
    cohortBuckets: [...cohortBuckets.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export default async function PartnerPortfolioPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  let auth: ReturnType<typeof verifyAccessToken>;
  try {
    auth = verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  if (!auth.partnerId || !auth.partnerRole) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Partner portfolio
        </h1>
        <p className="subhead">
          Your account is not linked to an institutional partner for this organization, or you are not on the partner
          billing org. Use refresh or sign in again after being granted partner access.
        </p>
      </div>
    );
  }

  const base = orgDashboardBaseUrl();
  const query = buildSummaryQuery(searchParams);
  const res = await fetch(`${base}/api/partner/portfolio/summary${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (res.status === 401 || res.status === 403) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Partner portfolio
        </h1>
        <p className="subhead">Could not load portfolio ({res.status}). Check enterprise features and partner access.</p>
      </div>
    );
  }

  if (!res.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Partner portfolio
        </h1>
        <p className="subhead">Portfolio request failed ({res.status}).</p>
      </div>
    );
  }

  const data = (await res.json()) as PortfolioSummary;

  const filterKeys = Object.keys(data.filtersApplied ?? {});
  const host = headers().get('host');
  const proto = headers().get('x-forwarded-proto') ?? 'https';
  const selfBase = host ? `${proto}://${host}` : '';

  const rollups = buildRollups(data.organizations);
  const highRiskRows = data.organizations
    .filter(isHighRiskOrOverdue)
    .sort((a, b) => riskSortScore(b) - riskSortScore(a) || a.name.localeCompare(b.name));

  const filterStrip = selfBase
    ? (
        <div style={{ marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Quick filters</div>
          <span style={{ opacity: 0.85 }}>Adds filter to current URL pattern (opens filtered portfolio). </span>
          <a href={`${selfBase}/dashboard/partner/portfolio`}>Clear filters</a>
          {' · '}
          <a href={portfolioPathWithParams(selfBase, searchParams, { governanceComplete: 'false' })}>Governance incomplete</a>
          {' · '}
          <a href={portfolioPathWithParams(selfBase, searchParams, { governanceComplete: 'true' })}>Governance complete</a>
          {' · '}
          <a href={portfolioPathWithParams(selfBase, searchParams, { stateRegHasOverdueRenewal: 'true' })}>Overdue state renewal</a>
          {' · '}
          <a href={portfolioPathWithParams(selfBase, searchParams, { auditPrepOverallStatus: 'overdue' })}>Audit prep overdue</a>
          {' · '}
          <a href={portfolioPathWithParams(selfBase, searchParams, { auditPrepOverallStatus: 'blocked' })}>Audit prep blocked</a>
          {auth.partnerRole === 'PARTNER_ADMIN' ? (
            <>
              {' · '}
              <a href={portfolioPathWithParams(selfBase, searchParams, { includeInactive: 'true' })}>Include inactive (admin)</a>
            </>
          ) : null}
        </div>
      )
    : null;

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Institutional portfolio
      </h1>
      <p className="subhead" style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        {data.resultCount} organization{data.resultCount === 1 ? '' : 's'} in this view
      </p>
      <p className="subhead" style={{ marginBottom: 8 }}>
        Partner role: {auth.partnerRole}
        {filterKeys.length > 0 ? ` · Active filter keys: ${filterKeys.join(', ')}` : ''}
      </p>
      <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 12 }}>{data.disclaimer}</p>
      <p style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.55, color: '#5f7080' }}>
        <b>How this view is built:</b> counts and flags below are simple rollups over each organization’s own governance,
        state registration, and audit prep trackers returned in this response. There is no separate portfolio score or
        predictive model—only the same fields shown in the table.
      </p>

      <p style={{ fontSize: 14, marginBottom: 12 }}>
        <a href={`/api/partner/portfolio/export${query}`}>Download CSV</a>
        <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 8 }}>
          (current filters; add <code style={{ fontSize: 12 }}>?sort=program</code> for program sort)
        </span>
      </p>

      {filterStrip}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 12 }}>Readiness &amp; compliance rollups</h2>
      <div className="cards" style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        <div className="card">
          <div className="cardTitle">Governance readiness</div>
          <p className="cardBody">Complete: <b>{rollups.govComplete}</b></p>
          <p className="cardBody">Incomplete: <b>{rollups.govIncomplete}</b></p>
        </div>
        <div className="card">
          <div className="cardTitle">Audit prep status</div>
          {rollups.auditByStatus.map(([status, n]) => (
            <p key={status} className="cardBody">{status}: <b>{n}</b></p>
          ))}
          {rollups.auditByStatus.length === 0 ? <p className="cardBody">—</p> : null}
        </div>
        <div className="card">
          <div className="cardTitle">Subscription status</div>
          <p className="cardBody" style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
            Billing/subscription state on the org record—not a compliance grade.
          </p>
          {rollups.subByStatus.map(([status, n]) => (
            <p key={status} className="cardBody">{status}: <b>{n}</b></p>
          ))}
        </div>
      </div>

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 12 }}>By program &amp; cohort</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="cardTitle">Program</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {rollups.programBuckets.map(([label, { count, programId }]) => (
              <li key={label} style={{ marginBottom: 6 }}>
                {programId && selfBase ? (
                  <a href={portfolioPathWithParams(selfBase, searchParams, { programId })}>{label}</a>
                ) : (
                  label
                )}
                : <b>{count}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="cardTitle">Cohort label</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {rollups.cohortBuckets.map(([label, count]) => (
              <li key={label} style={{ marginBottom: 6 }}>
                {label !== 'Unassigned' && selfBase ? (
                  <a href={portfolioPathWithParams(selfBase, searchParams, { cohortLabel: label })}>{label}</a>
                ) : (
                  label
                )}
                : <b>{count}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 8 }}>High-risk &amp; overdue organizations</h2>
      <p style={{ fontSize: 13, color: '#5f7080', marginBottom: 12, lineHeight: 1.5 }}>
        Listed if any of: state tracker shows overdue renewals, high-risk states, or missing registrations; audit prep is
        overdue/blocked or has overdue/blocked items; governance is incomplete. Sorted with audit block/overdue first, then
        renewals, then other signals.
      </p>
      {highRiskRows.length === 0 ? (
        <p style={{ fontSize: 14, marginBottom: 24 }}>None in the current filtered set.</p>
      ) : (
        <ol style={{ margin: '0 0 24px', paddingLeft: 22, fontSize: 14, lineHeight: 1.55 }}>
          {highRiskRows.map(row => (
            <li key={row.membershipId} style={{ marginBottom: 14 }}>
              <b>{row.name}</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {riskSignals(row).map(signal => (
                  <li key={signal}>{signal}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 12 }}>Portfolio table</h2>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
              <th style={{ padding: '8px 6px' }}>Organization</th>
              <th style={{ padding: '8px 6px' }}>EIN</th>
              <th style={{ padding: '8px 6px' }}>Program</th>
              <th style={{ padding: '8px 6px' }}>Cohort</th>
              <th style={{ padding: '8px 6px' }}>Active</th>
              <th style={{ padding: '8px 6px' }}>Tier</th>
              <th style={{ padding: '8px 6px' }}>Subscription</th>
              <th style={{ padding: '8px 6px' }}>Governance</th>
              <th style={{ padding: '8px 6px' }}>Audit prep</th>
              <th style={{ padding: '8px 6px' }}>State reg</th>
              <th style={{ padding: '8px 6px' }}>Notes / tags</th>
            </tr>
          </thead>
          <tbody>
            {data.organizations.map(row => {
              const s = row.stateRegistrations.summary;
              const stateCell = [
                s.overdueRenewals > 0 ? `${s.overdueRenewals} overdue renewal(s)` : null,
                s.highRiskStates > 0 ? `${s.highRiskStates} high-risk` : null,
                s.missingRegistrationStates > 0 ? `${s.missingRegistrationStates} missing reg.` : null,
              ].filter(Boolean).join('; ') || '—';
              return (
                <tr key={row.membershipId} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <td style={{ padding: '8px 6px' }}>{row.name}</td>
                  <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{row.ein}</td>
                  <td style={{ padding: '8px 6px' }}>{row.programLabel ?? '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{row.cohortLabel ?? '—'}</td>
                  <td style={{ padding: '8px 6px' }}>{row.isActive ? 'yes' : 'no'}</td>
                  <td style={{ padding: '8px 6px' }}>{row.subscriptionTier}</td>
                  <td style={{ padding: '8px 6px' }}>{row.subscriptionStatus}</td>
                  <td style={{ padding: '8px 6px' }}>
                    {row.governance.complete
                      ? `complete (${row.governance.completionRate}%)`
                      : `${row.governance.issueCount} issue(s)`}
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    {row.auditPrep.overallStatus} (open {row.auditPrep.openItems}, blocked {row.auditPrep.blockedItems},
                    overdue {row.auditPrep.overdueItems})
                  </td>
                  <td style={{ padding: '8px 6px', maxWidth: 200 }}>{stateCell}</td>
                  <td style={{ padding: '8px 6px', maxWidth: 220 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.partnerNotes ?? '—'}
                    </div>
                    {row.partnerTags.length > 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{row.partnerTags.join(', ')}</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 13 }}>
        <a href="/dashboard/partner/programs">Partner programs</a>
        {' · '}
        <a href="/dashboard">← Back to dashboard</a>
      </p>
    </div>
  );
}

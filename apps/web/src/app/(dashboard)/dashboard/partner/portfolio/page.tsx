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

type PortfolioRow = {
  membershipId: string;
  orgId: string;
  name: string;
  ein: string;
  subscriptionStatus: string;
  cohortLabel: string | null;
  isActive: boolean;
  partnerNotes: string | null;
  partnerTags: string[];
  governance: { complete: boolean; issueCount: number };
  auditPrep: { overallStatus: string; openItems: number };
  stateRegistrations: { summary: { overdueRenewals: number } };
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

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Institutional portfolio
      </h1>
      <p className="subhead" style={{ marginBottom: 12 }}>
        {data.resultCount} organization{data.resultCount === 1 ? '' : 's'}
        {filterKeys.length > 0 ? ` · filters: ${filterKeys.join(', ')}` : ''}
      </p>
      <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 20 }}>{data.disclaimer}</p>

      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
              <th style={{ padding: '8px 6px' }}>Organization</th>
              <th style={{ padding: '8px 6px' }}>EIN</th>
              <th style={{ padding: '8px 6px' }}>Cohort</th>
              <th style={{ padding: '8px 6px' }}>Active</th>
              <th style={{ padding: '8px 6px' }}>Subscription</th>
              <th style={{ padding: '8px 6px' }}>Governance</th>
              <th style={{ padding: '8px 6px' }}>Audit prep</th>
              <th style={{ padding: '8px 6px' }}>State reg</th>
              <th style={{ padding: '8px 6px' }}>Notes / tags</th>
            </tr>
          </thead>
          <tbody>
            {data.organizations.map(row => (
              <tr key={row.membershipId} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <td style={{ padding: '8px 6px' }}>{row.name}</td>
                <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{row.ein}</td>
                <td style={{ padding: '8px 6px' }}>{row.cohortLabel ?? '—'}</td>
                <td style={{ padding: '8px 6px' }}>{row.isActive ? 'yes' : 'no'}</td>
                <td style={{ padding: '8px 6px' }}>{row.subscriptionStatus}</td>
                <td style={{ padding: '8px 6px' }}>
                  {row.governance.complete ? 'complete' : `${row.governance.issueCount} issues`}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  {row.auditPrep.overallStatus} ({row.auditPrep.openItems} open)
                </td>
                <td style={{ padding: '8px 6px' }}>
                  {row.stateRegistrations.summary.overdueRenewals > 0
                    ? `${row.stateRegistrations.summary.overdueRenewals} overdue`
                    : 'ok'}
                </td>
                <td style={{ padding: '8px 6px', maxWidth: 220 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.partnerNotes ?? '—'}
                  </div>
                  {row.partnerTags.length > 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{row.partnerTags.join(', ')}</div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 13 }}>
        <a href="/dashboard">← Back to dashboard</a>
        {selfBase ? (
          <>
            {' · '}
            <span style={{ opacity: 0.8 }}>
              Filter example:{' '}
              <a href={`${selfBase}/dashboard/partner/portfolio?governanceComplete=true`}>governance complete</a>
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

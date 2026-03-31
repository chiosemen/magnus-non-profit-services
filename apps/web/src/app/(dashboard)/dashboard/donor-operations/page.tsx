import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

type DonorSummary = {
  orgId: string;
  giftCount: number;
  donorDataStatus: 'NOT_CONFIGURED' | 'INSUFFICIENT_DATA' | 'OK';
  coverage: { level: string; reasons: string[] };
  portfolio: {
    totalDonors: number;
    activeDonors: number;
    lapsedDonorCount: number;
    recurringDonorsDistinct365: number;
    recurringGiftsCount365: number;
    oneTimeGiftsCount365: number;
    activeDonorWindowDays: number;
    lapsedAfterDays: number;
  };
  formulas: Record<string, string>;
  meta: Record<string, unknown>;
  segments: Array<{
    segmentKey: string;
    donorCount: number;
    totalAmountLast365Usd: number;
    description: string;
  }>;
  lapsedDonors: Array<{ donorKey: string; lastGiftDate: string; daysSinceLastGift: number }>;
  recurringTrend: Array<{
    monthStart: string;
    recurringGiftCount: number;
    oneTimeGiftCount: number;
    recurringAmountUsd: number;
    oneTimeAmountUsd: number;
  }>;
  campaignSummary: Array<{
    campaignId: string;
    campaignName: string;
    giftCount: number;
    totalAmountUsd: number;
  }>;
  upgradeCandidates: Array<{ donorKey: string; ruleId: string; explanation: string }>;
};

function statusBannerStyle(status: DonorSummary['donorDataStatus']): React.CSSProperties {
  if (status === 'OK') {
    return {
      marginBottom: 20,
      padding: 12,
      borderRadius: 8,
      background: 'rgba(80, 200, 120, 0.1)',
      border: '1px solid rgba(80, 200, 120, 0.35)',
    };
  }
  if (status === 'NOT_CONFIGURED') {
    return {
      marginBottom: 20,
      padding: 12,
      borderRadius: 8,
      background: 'rgba(120, 160, 220, 0.12)',
      border: '1px solid rgba(120, 160, 220, 0.4)',
    };
  }
  return {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    background: 'rgba(255, 180, 80, 0.12)',
    border: '1px solid rgba(255, 180, 80, 0.35)',
  };
}

export default async function DonorOperationsPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const base = orgDashboardBaseUrl();
  const res = await fetch(`${base}/api/org/donor-operations/summary`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Donor operations
        </h1>
        <p className="subhead">
          Could not load donor summary ({res.status}). Requires GROWTH or ENTERPRISE with donor operations enabled.
        </p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const data = (await res.json()) as DonorSummary;
  const pf = data.portfolio;

  const statusTitle =
    data.donorDataStatus === 'NOT_CONFIGURED'
      ? 'NOT_CONFIGURED'
      : data.donorDataStatus === 'INSUFFICIENT_DATA'
        ? 'INSUFFICIENT_DATA'
        : 'OK — data coverage meets minimum thresholds';

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Donor operations
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Deterministic segments, lapsed donors, recurring trends, and rule-based upgrade signals — not wealth scoring or AI rankings.
      </p>

      <div style={statusBannerStyle(data.donorDataStatus)}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Data status: {statusTitle}</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          {data.coverage.reasons.length === 0 ? (
            <li>No data-quality warnings.</li>
          ) : (
            data.coverage.reasons.map((r, i) => <li key={i}>{r}</li>)
          )}
        </ul>
      </div>

      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="cardTitle">Total donors</div>
          <p className="cardBody">{pf.totalDonors}</p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75 }}>
            Distinct donorKey in gift ledger
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Active donors</div>
          <p className="cardBody">{pf.activeDonors}</p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75 }}>
            Last gift within {pf.activeDonorWindowDays} days
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Lapsed donors</div>
          <p className="cardBody">{pf.lapsedDonorCount}</p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75 }}>
            No gift in {pf.lapsedAfterDays}+ days
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Recurring (365d)</div>
          <p className="cardBody">{pf.recurringDonorsDistinct365} donors</p>
          <p className="cardBody" style={{ fontSize: 12 }}>
            {pf.recurringGiftsCount365} recurring gifts · {pf.oneTimeGiftsCount365} one-time gifts
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Gifts on file</div>
          <p className="cardBody">{data.giftCount}</p>
        </div>
      </div>

      <details style={{ marginBottom: 24, fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Cohort formulas (explainability)</summary>
        <ul style={{ marginTop: 10, paddingLeft: 18, opacity: 0.9 }}>
          {Object.entries(data.formulas ?? {}).map(([k, v]) => (
            <li key={k} style={{ marginBottom: 8 }}>
              <b>{k}</b>: {v}
            </li>
          ))}
        </ul>
      </details>

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Segments (last 365d rollups)
      </h2>
      {data.segments.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No segment rows yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 28 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '6px' }}>Segment</th>
              <th style={{ padding: '6px' }}>Donors</th>
              <th style={{ padding: '6px' }}>365d total USD</th>
            </tr>
          </thead>
          <tbody>
            {data.segments.map(s => (
              <tr key={s.segmentKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '8px 6px' }}>
                  <code>{s.segmentKey}</code>
                  <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>{s.description}</div>
                </td>
                <td style={{ padding: '8px 6px' }}>{s.donorCount}</td>
                <td style={{ padding: '8px 6px' }}>${s.totalAmountLast365Usd.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Lapsed donors
      </h2>
      {data.lapsedDonors.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>None under the current lapsed rule.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 28 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '6px' }}>Donor key</th>
              <th style={{ padding: '6px' }}>Last gift</th>
              <th style={{ padding: '6px' }}>Days since</th>
            </tr>
          </thead>
          <tbody>
            {data.lapsedDonors.slice(0, 50).map(d => (
              <tr key={d.donorKey} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '8px 6px' }}>
                  <code>{d.donorKey}</code>
                </td>
                <td style={{ padding: '8px 6px' }}>{new Date(d.lastGiftDate).toLocaleDateString()}</td>
                <td style={{ padding: '8px 6px' }}>{d.daysSinceLastGift}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Recurring vs one-time (12 months)
      </h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 28 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <th style={{ padding: '6px' }}>Month</th>
            <th style={{ padding: '6px' }}>Recurring $</th>
            <th style={{ padding: '6px' }}>One-time $</th>
          </tr>
        </thead>
        <tbody>
          {data.recurringTrend.map(m => (
            <tr key={m.monthStart} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <td style={{ padding: '6px' }}>{new Date(m.monthStart).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</td>
              <td style={{ padding: '6px' }}>${m.recurringAmountUsd.toLocaleString()}</td>
              <td style={{ padding: '6px' }}>${m.oneTimeAmountUsd.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Campaign response
      </h2>
      {data.campaignSummary.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No gifts linked to campaigns.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 28 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '6px' }}>Campaign</th>
              <th style={{ padding: '6px' }}>Gifts</th>
              <th style={{ padding: '6px' }}>Total USD</th>
            </tr>
          </thead>
          <tbody>
            {data.campaignSummary.map(c => (
              <tr key={c.campaignId} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '8px 6px' }}>{c.campaignName}</td>
                <td style={{ padding: '8px 6px' }}>{c.giftCount}</td>
                <td style={{ padding: '8px 6px' }}>${c.totalAmountUsd.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Upgrade candidates (rules only)
      </h2>
      {data.upgradeCandidates.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No rules fired for current data.</p>
      ) : (
        <ul style={{ fontSize: 14, paddingLeft: 18, marginBottom: 28 }}>
          {data.upgradeCandidates.map((u, i) => (
            <li key={`${u.donorKey}-${u.ruleId}-${i}`} style={{ marginBottom: 10 }}>
              <code>{u.donorKey}</code> — <b>{u.ruleId}</b>: {u.explanation}
            </li>
          ))}
        </ul>
      )}

      <p style={{ fontSize: 13, marginTop: 24 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

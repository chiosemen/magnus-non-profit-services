import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type GrantRow = {
  id: string;
  funderName: string;
  totalAmount: string | number;
  startDate: string;
  endDate: string;
  spentToDate: string | number;
  reportingSchedule: unknown;
};

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function money(n: string | number): string {
  const x = typeof n === 'string' ? parseFloat(n) : n;
  if (!Number.isFinite(x)) return String(n);
  return `$${x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function GrantsDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const base = orgDashboardBaseUrl();
  const res = await fetch(`${base}/api/org/grants`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Grants
        </h1>
        <p className="subhead">
          Could not load grants ({res.status}). The grant list requires a GROWTH or higher plan with grant features enabled.
        </p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const payload = (await res.json()) as { orgId: string; grants: GrantRow[] };
  const grants = payload.grants ?? [];

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Grants
      </h1>
      <p className="subhead" style={{ marginBottom: 20 }}>
        Read-only portfolio view from org-dashboard-api. Proposal drafting lives in the grant generator workflow.
      </p>

      {grants.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85 }}>No grant records for this organization.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '8px 6px' }}>Funder</th>
              <th style={{ padding: '8px 6px' }}>Amount</th>
              <th style={{ padding: '8px 6px' }}>Spent</th>
              <th style={{ padding: '8px 6px' }}>Period</th>
            </tr>
          </thead>
          <tbody>
            {grants.map(g => (
              <tr key={g.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '10px 6px' }}>{g.funderName}</td>
                <td style={{ padding: '10px 6px' }}>{money(g.totalAmount)}</td>
                <td style={{ padding: '10px 6px' }}>{money(g.spentToDate)}</td>
                <td style={{ padding: '10px 6px', fontSize: 12 }}>
                  {new Date(g.startDate).toLocaleDateString()} – {new Date(g.endDate).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 13, marginTop: 24 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

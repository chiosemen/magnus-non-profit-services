import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type ComplianceItem = {
  id: string;
  deadlineType: string;
  dueDate: string;
  status: string;
};

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default async function ComplianceDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const base = orgDashboardBaseUrl();
  const res = await fetch(`${base}/api/org/compliance`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Compliance calendar
        </h1>
        <p className="subhead">
          Could not load compliance items ({res.status}). Your plan may not include the compliance calendar, or the org API is unavailable.
        </p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const payload = (await res.json()) as { orgId: string; complianceCalendar: ComplianceItem[] };
  const items = payload.complianceCalendar ?? [];

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Compliance calendar
      </h1>
      <p className="subhead" style={{ marginBottom: 20 }}>
        Read-only view of filing and registration deadlines from org-dashboard-api. Edit flows remain on other surfaces as you add them.
      </p>

      {items.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85 }}>No compliance calendar rows for this organization.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '8px 6px' }}>Type</th>
              <th style={{ padding: '8px 6px' }}>Due</th>
              <th style={{ padding: '8px 6px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '10px 6px' }}>{row.deadlineType.replace(/_/g, ' ')}</td>
                <td style={{ padding: '10px 6px' }}>{formatDue(row.dueDate)}</td>
                <td style={{ padding: '10px 6px' }}>{row.status}</td>
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

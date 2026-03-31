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

type VolunteerSummary = {
  orgId: string;
  volunteerDataStatus: 'NOT_CONFIGURED' | 'INSUFFICIENT_DATA' | 'OK';
  coverage: { level: string; reasons: string[] };
  formulas: Record<string, string>;
  meta: Record<string, unknown>;
  assumptions: {
    inKindFormula: string;
    hourlyRateUsd: number | null;
    inKindEstimateUsd: number | null;
    inKindAvailable: boolean;
    valuationDisclaimer: string;
  };
  totals: {
    totalHours: number;
    activeVolunteerProfiles: number;
    totalVolunteerProfiles: number;
    timeEntryCount: number;
    volunteersWithHoursLast365: number;
  };
  hoursByPeriod: {
    last30Days: number;
    last90Days: number;
    last365Days: number;
  };
  hoursByProgram: Array<{ programLabel: string; hours: number }>;
  rosterSummary: Array<{
    volunteerId: string;
    displayName: string;
    isActive: boolean;
    totalHours: number;
    lastOccurredAt: string | null;
  }>;
  recentActivity: Array<{
    timeEntryId: string;
    volunteerId: string;
    displayName: string;
    programLabel: string;
    hours: number;
    occurredAt: string;
    timesheetStatus: string;
  }>;
  upcomingAssignments: Array<{
    id: string;
    title: string;
    programLabel: string;
    startAt: string;
    volunteerId: string | null;
  }>;
  alerts: {
    missingTimesheetFields: Array<{ timeEntryId: string; volunteerId: string; occurredAt: string; message: string }>;
    assignmentsWithoutTimeEntry: Array<{ assignmentId: string; title: string; startAt: string; message: string }>;
  };
};

function statusBannerStyle(status: VolunteerSummary['volunteerDataStatus']): React.CSSProperties {
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

export default async function VolunteerOperationsPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const base = orgDashboardBaseUrl();
  const res = await fetch(`${base}/api/org/volunteer-operations/summary`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Volunteer operations
        </h1>
        <p className="subhead">
          Could not load volunteer summary ({res.status}). Requires GROWTH or ENTERPRISE with volunteer operations enabled.
        </p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const data = (await res.json()) as VolunteerSummary;

  const statusTitle =
    data.volunteerDataStatus === 'NOT_CONFIGURED'
      ? 'NOT_CONFIGURED'
      : data.volunteerDataStatus === 'INSUFFICIENT_DATA'
        ? 'INSUFFICIENT_DATA'
        : 'OK — data meets minimum thresholds';

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Volunteer operations
      </h1>
      <p className="subhead" style={{ marginBottom: 20 }}>
        Roster summary, hours by period and program, and illustrative in-kind value — operational reporting, not a scheduling or messaging platform.
      </p>

      <div style={statusBannerStyle(data.volunteerDataStatus)}>
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
          <div className="cardTitle">Total volunteers</div>
          <p className="cardBody">{data.totals.totalVolunteerProfiles}</p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75 }}>
            Profiles on roster
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Active (roster)</div>
          <p className="cardBody">{data.totals.activeVolunteerProfiles}</p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75 }}>
            isActive flag on profile
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">With hours (365d)</div>
          <p className="cardBody">{data.totals.volunteersWithHoursLast365}</p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75 }}>
            Logged at least one hour in last 365 days
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Total hours</div>
          <p className="cardBody">{data.totals.totalHours.toLocaleString()}</p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75 }}>
            {data.totals.timeEntryCount} time entries
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">In-kind estimate</div>
          <p className="cardBody">
            {data.assumptions.inKindAvailable && data.assumptions.inKindEstimateUsd != null
              ? `$${data.assumptions.inKindEstimateUsd.toLocaleString()} (@ $${data.assumptions.hourlyRateUsd}/hr)`
              : 'Set organization hourly rate (API) to compute estimate.'}
          </p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.85 }}>
            {data.assumptions.inKindFormula}
          </p>
          <p className="cardBody" style={{ fontSize: 11, opacity: 0.75, fontStyle: 'italic' }}>
            {data.assumptions.valuationDisclaimer}
          </p>
        </div>
      </div>

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Hours by period (rolling, UTC)
      </h2>
      <table style={{ width: '100%', maxWidth: 420, borderCollapse: 'collapse', fontSize: 13, marginBottom: 28 }}>
        <tbody>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <td style={{ padding: '8px 6px' }}>Last 30 days</td>
            <td style={{ padding: '8px 6px' }}>{data.hoursByPeriod.last30Days.toLocaleString()}</td>
          </tr>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <td style={{ padding: '8px 6px' }}>Last 90 days</td>
            <td style={{ padding: '8px 6px' }}>{data.hoursByPeriod.last90Days.toLocaleString()}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px 6px' }}>Last 365 days</td>
            <td style={{ padding: '8px 6px' }}>{data.hoursByPeriod.last365Days.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Hours by program
      </h2>
      {data.hoursByProgram.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No time entries yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 28 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '6px' }}>Program</th>
              <th style={{ padding: '6px' }}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {data.hoursByProgram.map(row => (
              <tr key={row.programLabel} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '8px 6px' }}>{row.programLabel}</td>
                <td style={{ padding: '8px 6px' }}>{row.hours.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Roster summary
      </h2>
      {data.rosterSummary.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No volunteer profiles.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 28 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '6px' }}>Name</th>
              <th style={{ padding: '6px' }}>Roster active</th>
              <th style={{ padding: '6px' }}>Total hours</th>
              <th style={{ padding: '6px' }}>Last log</th>
            </tr>
          </thead>
          <tbody>
            {data.rosterSummary.map(r => (
              <tr key={r.volunteerId} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '8px 6px' }}>{r.displayName}</td>
                <td style={{ padding: '8px 6px' }}>{r.isActive ? 'Yes' : 'No'}</td>
                <td style={{ padding: '8px 6px' }}>{r.totalHours.toLocaleString()}</td>
                <td style={{ padding: '8px 6px' }}>
                  {r.lastOccurredAt ? new Date(r.lastOccurredAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Recent activity
      </h2>
      {data.recentActivity.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No time entries.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 28 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <th style={{ padding: '6px' }}>When</th>
              <th style={{ padding: '6px' }}>Volunteer</th>
              <th style={{ padding: '6px' }}>Program</th>
              <th style={{ padding: '6px' }}>Hours</th>
              <th style={{ padding: '6px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.recentActivity.map(a => (
              <tr key={a.timeEntryId} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '6px' }}>{new Date(a.occurredAt).toLocaleString()}</td>
                <td style={{ padding: '6px' }}>{a.displayName}</td>
                <td style={{ padding: '6px' }}>{a.programLabel}</td>
                <td style={{ padding: '6px' }}>{a.hours}</td>
                <td style={{ padding: '6px' }}>{a.timesheetStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details style={{ marginBottom: 24, fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Formulas (explainability)</summary>
        <ul style={{ marginTop: 10, paddingLeft: 18, opacity: 0.9 }}>
          {Object.entries(data.formulas ?? {}).map(([k, v]) => (
            <li key={k} style={{ marginBottom: 8 }}>
              <b>{k}</b>: {v}
            </li>
          ))}
        </ul>
      </details>

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Upcoming assignments
      </h2>
      {data.upcomingAssignments.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No upcoming assignments in range.</p>
      ) : (
        <ul style={{ fontSize: 14, paddingLeft: 18, marginBottom: 28 }}>
          {data.upcomingAssignments.map(a => (
            <li key={a.id} style={{ marginBottom: 8 }}>
              <b>{a.title}</b> — {a.programLabel} @ {new Date(a.startAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Alerts
      </h2>
      <p style={{ fontSize: 13, marginBottom: 8 }}>
        Missing timesheet flags: {data.alerts.missingTimesheetFields.length}; assignments without time:{' '}
        {data.alerts.assignmentsWithoutTimeEntry.length}
      </p>
      {data.alerts.missingTimesheetFields.slice(0, 10).map(a => (
        <p key={a.timeEntryId} style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
          {a.message} ({a.occurredAt})
        </p>
      ))}
      {data.alerts.assignmentsWithoutTimeEntry.slice(0, 10).map(a => (
        <p key={a.assignmentId} style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
          {a.message} — {a.title}
        </p>
      ))}

      <p style={{ fontSize: 13, marginTop: 24 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

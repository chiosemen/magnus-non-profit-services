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
  assumptions: {
    inKindFormula: string;
    hourlyRateUsd: number | null;
    inKindEstimateUsd: number | null;
    inKindAvailable: boolean;
  };
  totals: {
    totalHours: number;
    activeVolunteerProfiles: number;
    totalVolunteerProfiles: number;
    timeEntryCount: number;
  };
  hoursByProgram: Array<{ programLabel: string; hours: number }>;
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

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Volunteer operations
      </h1>
      <p className="subhead" style={{ marginBottom: 20 }}>
        Hours, program attribution, and in-kind estimate from your hourly rate — operational reporting, not a scheduling CRM.
      </p>

      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="cardTitle">Total hours</div>
          <p className="cardBody">{data.totals.totalHours.toLocaleString()}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Active volunteers</div>
          <p className="cardBody">{data.totals.activeVolunteerProfiles} active / {data.totals.totalVolunteerProfiles} profiles</p>
        </div>
        <div className="card">
          <div className="cardTitle">In-kind estimate</div>
          <p className="cardBody">
            {data.assumptions.inKindAvailable && data.assumptions.inKindEstimateUsd != null
              ? `$${data.assumptions.inKindEstimateUsd.toLocaleString()} (@ $${data.assumptions.hourlyRateUsd}/hr)`
              : 'Set organization hourly rate via API to enable estimate.'}
          </p>
          <p className="cardBody" style={{ fontSize: 12, opacity: 0.8 }}>
            {data.assumptions.inKindFormula}
          </p>
        </div>
      </div>

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

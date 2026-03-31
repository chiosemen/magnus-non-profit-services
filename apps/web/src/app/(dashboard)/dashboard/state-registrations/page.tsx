import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type RiskSeverity = 'high' | 'medium';
type RiskCode = 'MISSING_REGISTRATION' | 'OVERDUE_RENEWAL' | 'UNKNOWN_STATUS';

type StateRegistrationSnapshot = {
  orgId: string;
  asOf: string;
  summary: {
    trackedStates: number;
    solicitationStates: number;
    activeStates: number;
    pendingStates: number;
    missingRegistrationStates: number;
    overdueRenewals: number;
    unknownStates: number;
    highRiskStates: number;
  };
  registrations: Array<{
    stateCode: string;
    stateName: string;
    trackedStatus: 'active' | 'pending' | 'not_registered' | 'unknown';
    userEntered: {
      solicitsDonations: boolean;
      renewalDueDate: string | null;
      renewalNotes: string | null;
      updatedAt: string;
    };
    riskFlags: Array<{
      code: RiskCode;
      severity: RiskSeverity;
      message: string;
      generatedBy: 'system';
    }>;
  }>;
  disclaimer: string;
};

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function toDayValue(dateString: string): number {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export default async function StateRegistrationsDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const response = await fetch(`${orgDashboardBaseUrl()}/api/org/state-registrations`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Multi-state registration dashboard
        </h1>
        <p className="subhead">Could not load state registration records ({response.status}).</p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const snapshot = (await response.json()) as StateRegistrationSnapshot;
  const asOfDay = toDayValue(snapshot.asOf);

  const registeredCount = snapshot.summary.activeStates + snapshot.summary.pendingStates;
  const nearestRenewals = snapshot.registrations
    .filter(registration => registration.userEntered.renewalDueDate !== null)
    .map(registration => ({
      stateCode: registration.stateCode,
      stateName: registration.stateName,
      renewalDueDate: registration.userEntered.renewalDueDate as string,
      isOverdue: toDayValue(registration.userEntered.renewalDueDate as string) < asOfDay,
      trackedStatus: registration.trackedStatus,
    }))
    .sort((left, right) => toDayValue(left.renewalDueDate) - toDayValue(right.renewalDueDate))
    .slice(0, 8);

  const riskFlagCounts = snapshot.registrations.reduce<Record<RiskCode, number>>((acc, registration) => {
    for (const flag of registration.riskFlags) {
      acc[flag.code] = (acc[flag.code] ?? 0) + 1;
    }
    return acc;
  }, {
    MISSING_REGISTRATION: 0,
    OVERDUE_RENEWAL: 0,
    UNKNOWN_STATUS: 0,
  });

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 32, marginBottom: 8 }}>
        Multi-state registration dashboard
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Compliance risk view from tracked state registrations and deterministic system-generated reminders.
      </p>

      <div className="cards">
        <div className="card">
          <div className="cardTitle">Overall registration risk summary</div>
          <p className="cardBody"><b>Tracked states:</b> {snapshot.summary.trackedStates}</p>
          <p className="cardBody"><b>High-risk states:</b> {snapshot.summary.highRiskStates}</p>
          <p className="cardBody"><b>As of:</b> {snapshot.asOf}</p>
          <p className="cardBody" style={{ fontSize: 12 }}>
            User-entered status is shown separately from system-derived risk flags.
          </p>
        </div>

        <div className="card">
          <div className="cardTitle">Status counts</div>
          <p className="cardBody"><b>Registered (active + pending):</b> {registeredCount}</p>
          <p className="cardBody"><b>Overdue renewals:</b> {snapshot.summary.overdueRenewals}</p>
          <p className="cardBody"><b>Unknown status:</b> {snapshot.summary.unknownStates}</p>
          <p className="cardBody"><b>Missing registration:</b> {snapshot.summary.missingRegistrationStates}</p>
        </div>

        <div className="card">
          <div className="cardTitle">Renewal risk flags (system-derived)</div>
          <p className="cardBody"><b>Missing registration flags:</b> {riskFlagCounts.MISSING_REGISTRATION}</p>
          <p className="cardBody"><b>Overdue renewal flags:</b> {riskFlagCounts.OVERDUE_RENEWAL}</p>
          <p className="cardBody"><b>Unknown status flags:</b> {riskFlagCounts.UNKNOWN_STATUS}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Nearest renewal deadlines</div>
        {nearestRenewals.length === 0 ? (
          <p className="cardBody">No renewal due dates have been entered.</p>
        ) : (
          <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
            {nearestRenewals.map(item => (
              <li key={`${item.stateCode}-${item.renewalDueDate}`}>
                {item.stateName} ({item.stateCode}) - {item.renewalDueDate}
                {item.isOverdue ? ' [overdue]' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">State-by-state status table</div>
        {snapshot.registrations.length === 0 ? (
          <p className="cardBody">No tracked states yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                  <th style={{ padding: '8px 6px' }}>State</th>
                  <th style={{ padding: '8px 6px' }}>User-entered status</th>
                  <th style={{ padding: '8px 6px' }}>User-entered renewal due date</th>
                  <th style={{ padding: '8px 6px' }}>User-entered notes</th>
                  <th style={{ padding: '8px 6px' }}>System-derived risk flags</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.registrations.map(registration => (
                  <tr key={registration.stateCode} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <td style={{ padding: '8px 6px' }}>{registration.stateName} ({registration.stateCode})</td>
                    <td style={{ padding: '8px 6px' }}>
                      {titleCase(registration.trackedStatus)}
                      {registration.userEntered.solicitsDonations ? ' · Solicits donations' : ' · Does not solicit'}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{registration.userEntered.renewalDueDate ?? 'Not set'}</td>
                    <td style={{ padding: '8px 6px' }}>{registration.userEntered.renewalNotes ?? '—'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {registration.riskFlags.length === 0
                        ? 'None'
                        : registration.riskFlags.map(flag => `${titleCase(flag.code)} (${flag.severity})`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="subhead" style={{ marginTop: 16 }}>
        {snapshot.disclaimer}
      </p>

      <p style={{ fontSize: 13, marginTop: 16 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

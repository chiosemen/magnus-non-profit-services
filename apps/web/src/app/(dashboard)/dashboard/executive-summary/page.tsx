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

type ExecutiveSection = {
  coverage: string;
  moduleState: string;
  source: string;
  dashboardHref: string;
  summary: Record<string, unknown>;
  unavailableReason?: string;
};

type ExecutiveAlert = {
  id: string;
  severity: string;
  message: string;
  sourceModule: string;
  dashboardHref: string;
  evidence: { kind: string; path: string };
  confidence: string;
};

type ExecutivePayload = {
  orgId: string;
  generatedAt: string;
  disclaimer: string;
  scopeNotes?: string[];
  alerts?: ExecutiveAlert[];
  sections: Record<string, ExecutiveSection>;
};

const SECTION_LABELS: Record<string, string> = {
  compliance: 'Compliance calendar',
  grants: 'Grants',
  restrictedFunds: 'Restricted funds',
  governance: 'Governance',
  auditPrep: 'Audit prep',
  stateRegistrations: 'State registrations',
  form990Readiness: '990 & funder readiness',
  cashFlow: 'Cash flow (13-week)',
  donorOperations: 'Donor operations',
  volunteerOperations: 'Volunteer operations',
  institutionalPortfolio: 'Institutional portfolio',
};

function severityStyle(sev: string): React.CSSProperties {
  if (sev === 'high') return { borderLeft: '4px solid #c94c4c', background: 'rgba(200,60,60,0.08)' };
  if (sev === 'medium') return { borderLeft: '4px solid #c9a227', background: 'rgba(200,160,40,0.08)' };
  return { borderLeft: '4px solid rgba(120,160,220,0.6)', background: 'rgba(120,160,220,0.08)' };
}

function renderSectionSummary(sectionKey: string, sec: ExecutiveSection): React.ReactNode {
  if (sec.coverage === 'unavailable') {
    return sec.unavailableReason ? <span>{sec.unavailableReason}</span> : null;
  }

  const s = sec.summary;

  switch (sectionKey) {
    case 'compliance':
      return <span>Upcoming deadlines in range: {String(s['upcomingDeadlines'] ?? '—')}</span>;
    case 'grants':
      return <span>Grant records: {String(s['grantRecordCount'] ?? '—')}</span>;
    case 'restrictedFunds':
      return <span>Funds: {String(s['fundCount'] ?? '—')}</span>;
    case 'governance':
      return <span>Board members: {String(s['boardMemberCount'] ?? '—')}</span>;
    case 'auditPrep':
      return (
        <span>
          Items: {String(s['itemCount'] ?? '—')}, blocked: {String(s['blockedCount'] ?? '—')}
        </span>
      );
    case 'stateRegistrations':
      return <span>Registrations: {String(s['registrationCount'] ?? '—')}</span>;
    case 'form990Readiness':
      if (s['status'] === 'insufficient_data') return <span>Status: insufficient_data (complete filing inputs in module).</span>;
      return (
        <span>
          Tax year {String(s['taxYear'] ?? '—')}, overall score {String(s['overallScore'] ?? '—')}
        </span>
      );
    case 'cashFlow':
      if (s['status'] === 'insufficient_data') {
        return <span>{typeof s['message'] === 'string' ? s['message'] : 'Inputs incomplete for forecast.'}</span>;
      }
      return (
        <span>
          Projected ending cash: {String(s['projectedEndingCash'] ?? '—')}; lowest projected:{' '}
          {String(s['lowestProjectedCash'] ?? '—')}
          {s['lowCashAlertTriggered'] === true ? ' — low-cash rule triggered' : ''}
        </span>
      );
    case 'donorOperations':
      return (
        <span>
          Data status: {String(s['donorDataStatus'] ?? '—')}; gifts: {String(s['giftCount'] ?? '—')}; lapsed rows:{' '}
          {String(s['lapsedCount'] ?? '—')}
        </span>
      );
    case 'volunteerOperations':
      return (
        <span>
          Data status: {String(s['volunteerDataStatus'] ?? '—')}; hours: {String(s['totalHours'] ?? '—')}; entries:{' '}
          {String(s['timeEntryCount'] ?? '—')}
        </span>
      );
    case 'institutionalPortfolio':
      return <span>Use partner portfolio when your session has partner access.</span>;
    default:
      return <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{JSON.stringify(s)}</span>;
  }
}

export default async function ExecutiveSummaryPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const base = orgDashboardBaseUrl();
  const res = await fetch(`${base}/api/org/executive-summary`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Executive command center
        </h1>
        <p className="subhead">
          Could not load executive rollup ({res.status}). Requires ENTERPRISE with executive rollups enabled.
        </p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const data = (await res.json()) as ExecutivePayload;
  const alerts = data.alerts ?? [];
  const scopeNotes = data.scopeNotes ?? [];

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Executive command center
      </h1>
      <p className="subhead" style={{ marginBottom: 8 }}>
        {data.disclaimer}
      </p>
      <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 16 }}>
        Generated {new Date(data.generatedAt).toLocaleString()}
      </p>

      {scopeNotes.length > 0 && (
        <div style={{ marginBottom: 24, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Scope</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, opacity: 0.9 }}>
            {scopeNotes.map((n, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Deterministic alerts
      </h2>
      {alerts.length === 0 ? (
        <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>No rule-based alerts from current module outputs.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px 0' }}>
          {alerts.map(a => (
            <li
              key={a.id}
              style={{
                marginBottom: 10,
                padding: '10px 12px',
                borderRadius: 6,
                ...severityStyle(a.severity),
              }}
            >
              <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.85, marginBottom: 4 }}>
                {a.severity} · {a.confidence} · evidence: {a.evidence.path}
              </div>
              <div style={{ fontSize: 14 }}>{a.message}</div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
                Module: {a.sourceModule} —{' '}
                <a href={a.dashboardHref}>Open source</a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="h2" style={{ fontSize: 18, marginBottom: 10 }}>
        Modules
      </h2>
      <div className="cards">
        {Object.entries(data.sections).map(([key, sec]) => (
          <div key={key} className="card">
            <div className="cardTitle">{SECTION_LABELS[key] ?? key}</div>
            <p className="cardBody">
              <b>Module state:</b> {sec.moduleState}
            </p>
            <p className="cardBody" style={{ fontSize: 12 }}>
              <b>Coverage:</b> {sec.coverage} · <b>Source:</b> {sec.source}
            </p>
            {sec.unavailableReason && (
              <p className="cardBody" style={{ fontSize: 12, opacity: 0.85 }}>
                {sec.unavailableReason}
              </p>
            )}
            <p className="cardBody" style={{ fontSize: 13 }}>
              {renderSectionSummary(key, sec)}
            </p>
            <p className="cardBody">
              <a href={sec.dashboardHref}>Open module</a>
            </p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, marginTop: 24 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

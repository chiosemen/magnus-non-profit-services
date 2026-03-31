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
  source: string;
  dashboardHref: string;
  summary: Record<string, unknown>;
  unavailableReason?: string;
};

type ExecutivePayload = {
  orgId: string;
  generatedAt: string;
  disclaimer: string;
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
  donorOperations: 'Donor operations',
  volunteerOperations: 'Volunteer operations',
};

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
          Executive summary
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

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Executive summary
      </h1>
      <p className="subhead" style={{ marginBottom: 8 }}>{data.disclaimer}</p>
      <p style={{ fontSize: 12, opacity: 0.75, marginBottom: 24 }}>
        Generated {new Date(data.generatedAt).toLocaleString()}
      </p>

      <div className="cards">
        {Object.entries(data.sections).map(([key, sec]) => (
          <div key={key} className="card">
            <div className="cardTitle">{SECTION_LABELS[key] ?? key}</div>
            <p className="cardBody">
              <b>Coverage:</b> {sec.coverage}
            </p>
            <p className="cardBody" style={{ fontSize: 12 }}>
              <b>Source:</b> {sec.source}
            </p>
            {sec.unavailableReason && (
              <p className="cardBody" style={{ fontSize: 12, opacity: 0.85 }}>
                {sec.unavailableReason}
              </p>
            )}
            {sec.coverage !== 'unavailable' && (
              <p className="cardBody" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {JSON.stringify(sec.summary)}
              </p>
            )}
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

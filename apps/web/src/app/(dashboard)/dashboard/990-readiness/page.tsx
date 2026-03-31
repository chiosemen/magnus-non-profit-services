import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type ReadinessInsufficient = {
  status: 'insufficient_data';
  message: string;
  requiredFields: string[];
};

type ReadinessReady = {
  status: 'ready';
  orgId: string;
  ein: string;
  name: string;
  taxYear: number;
  caveat: string;
  overallScore: number;
  explanation: string;
  methodology: string;
  components: Array<{
    key: string;
    title: string;
    score: number;
    weight: number;
    rating: string;
    displayValue: string;
    formula: string;
    explanation: string;
  }>;
  watchouts: Array<{ title: string; detail: string; priority: string }>;
  recommendedActions: Array<{ title: string; detail: string; priority: string }>;
  reportHtml: string;
};

type ReadinessPayload = ReadinessInsufficient | ReadinessReady;

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function ratingLabel(rating: string): string {
  return rating.replace(/_/g, ' ');
}

export default async function Form990ReadinessDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const response = await fetch(`${orgDashboardBaseUrl()}/api/org/990/readiness`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Form 990 &amp; funder readiness
        </h1>
        <p className="subhead">Could not load readiness data ({response.status}).</p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const payload = (await response.json()) as ReadinessPayload;

  if (payload.status === 'insufficient_data') {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Form 990 &amp; funder readiness
        </h1>
        <p className="subhead" style={{ marginBottom: 20 }}>{payload.message}</p>
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="cardTitle">What we need</div>
          <p className="cardBody" style={{ marginBottom: 12 }}>
            Numeric scores and the funder report appear only after a complete structured filing is stored for your organization (via API or internal tools).
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.5 }}>
            {payload.requiredFields.map(field => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
        <p style={{ fontSize: 13, marginTop: 24 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
        Form 990 &amp; funder readiness
      </h1>
      <p className="subhead" style={{ marginBottom: 20 }}>
        Tax year {payload.taxYear} — {payload.name} (EIN {payload.ein})
      </p>

      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="cardTitle">990 health score</div>
          <p className="cardBody" style={{ fontSize: 42, fontWeight: 700, margin: '8px 0' }}>
            {payload.overallScore}
            <span style={{ fontSize: 18, fontWeight: 500, marginLeft: 6 }}>/ 100</span>
          </p>
          <p className="cardBody" style={{ fontSize: 14, lineHeight: 1.5 }}>{payload.explanation}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Funder report</div>
          <p className="cardBody">
            Open the print-ready HTML report in a new tab (same content as funders would review from your filing inputs).
          </p>
          <p className="cardBody">
            <a href="/api/dashboard/990-readiness/report" target="_blank" rel="noopener noreferrer">
              View funder readiness report
            </a>
          </p>
        </div>
      </div>

      <h2 className="h2" style={{ fontSize: 20, marginBottom: 12 }}>Sub-score breakdown</h2>
      <div className="cards" style={{ marginBottom: 28 }}>
        {payload.components.map(component => (
          <div className="card" key={component.key}>
            <div className="cardTitle">{component.title}</div>
            <p className="cardBody">
              <b>Score:</b> {component.score}{' '}
              <span style={{ color: '#5f7080' }}>(weight {(component.weight * 100).toFixed(0)}%)</span>
            </p>
            <p className="cardBody"><b>Rating:</b> {ratingLabel(component.rating)}</p>
            <p className="cardBody"><b>Metric:</b> {component.displayValue}</p>
            <p className="cardBody" style={{ fontSize: 13, lineHeight: 1.55 }}>{component.explanation}</p>
          </div>
        ))}
      </div>

      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="cardTitle">Top risks &amp; watchouts</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.55 }}>
            {payload.watchouts.map(item => (
              <li key={item.title} style={{ marginBottom: 12 }}>
                <strong>{item.title}</strong>
                <span style={{ color: '#5f7080', marginLeft: 8 }}>({item.priority})</span>
                <div style={{ marginTop: 4 }}>{item.detail}</div>
              </li>
            ))}
          </ol>
        </div>
        <div className="card">
          <div className="cardTitle">Recommended actions</div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.55 }}>
            {payload.recommendedActions.map(item => (
              <li key={item.title} style={{ marginBottom: 12 }}>
                <strong>{item.title}</strong>
                <span style={{ color: '#5f7080', marginLeft: 8 }}>({item.priority})</span>
                <div style={{ marginTop: 4 }}>{item.detail}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#5f7080', lineHeight: 1.5, marginBottom: 8 }}>
        <b>Methodology:</b> {payload.methodology}
      </p>
      <p style={{ fontSize: 13, color: '#5f7080', lineHeight: 1.5, marginBottom: 24 }}>
        {payload.caveat}
      </p>

      <p style={{ fontSize: 13 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

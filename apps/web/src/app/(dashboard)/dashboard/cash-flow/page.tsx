import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type CashFlowInsufficient = {
  status: 'insufficient_data';
  message: string;
  requiredFields: string[];
};

type CashFlowReady = {
  status: 'ready';
  orgId: string;
  name: string;
  caveat: string;
  methodology: string;
  horizonWeeks: number;
  currentCashBalance: number;
  projectedEndingCash: number;
  thresholdUsd: number;
  thresholdSource: 'reserve_target' | 'default_zero_floor';
  lowCashAlert: {
    triggered: boolean;
    weeksBelowThreshold: number[];
    explanation: string;
  };
  highestRiskWeeks: Array<{
    weekNumber: number;
    endingCash: number;
    belowThreshold: boolean;
    explanation: string;
  }>;
  summary: {
    totalInflows: number;
    totalOutflows: number;
    netOverHorizon: number;
    lowestProjectedCash: number;
    lowestCashWeek: number;
  };
  assumptions: {
    current_cash_balance: number;
    expected_grant_inflows: Array<{ week: number; amount: number; label?: string }>;
    expected_donation_inflows: Array<{ week: number; amount: number; label?: string }>;
    payroll_schedule: {
      cadence: string;
      amount: number;
      first_payment_week: number;
    };
    recurring_operating_expenses: Array<{
      name: string;
      amount: number;
      cadence: string;
      first_due_week: number;
    }>;
    reserve_threshold_target?: number;
  };
  weeklyEndingCashTrend: Array<{
    weekNumber: number;
    endingCash: number;
    belowThreshold: boolean;
  }>;
};

type CashFlowPayload = CashFlowInsufficient | CashFlowReady;

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function CashFlowDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const response = await fetch(`${orgDashboardBaseUrl()}/api/org/cash-flow/forecast`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>Cash flow forecast</h1>
        <p className="subhead">Could not load forecast ({response.status}).</p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const payload = (await response.json()) as CashFlowPayload;

  if (payload.status === 'insufficient_data') {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>Cash flow forecast</h1>
        <p className="subhead" style={{ marginBottom: 20 }}>{payload.message}</p>
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="cardTitle">Required assumption fields</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.5 }}>
            {payload.requiredFields.map(field => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
        <p style={{ fontSize: 13, marginTop: 24, color: '#5f7080' }}>
          Save inputs via <code style={{ fontSize: 12 }}>PUT /api/org/cash-flow/inputs</code> (or internal tools). No forecast numbers are shown until assumptions validate.
        </p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const thresholdNote = payload.thresholdSource === 'default_zero_floor'
    ? 'Using $0 floor (no reserve target supplied).'
    : 'Using your stated reserve threshold.';

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>Cash flow forecast</h1>
      <p className="subhead" style={{ marginBottom: 20 }}>
        {payload.name} — deterministic {payload.horizonWeeks}-week projection from stored assumptions
      </p>

      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="cardTitle">Current cash position (assumed)</div>
          <p className="cardBody" style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>
            {usd(payload.currentCashBalance)}
          </p>
          <p className="cardBody" style={{ fontSize: 13, color: '#5f7080' }}>
            Starting balance you entered; not a live bank feed.
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Projected ending cash (week {payload.horizonWeeks})</div>
          <p className="cardBody" style={{ fontSize: 28, fontWeight: 700, margin: '8px 0' }}>
            {usd(payload.projectedEndingCash)}
          </p>
          <p className="cardBody" style={{ fontSize: 13, color: '#5f7080' }}>
            End of horizon after modeled inflows and outflows only.
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Reserve threshold &amp; alert</div>
          <p className="cardBody">
            <b>Threshold:</b> {usd(payload.thresholdUsd)} — {thresholdNote}
          </p>
          <p className="cardBody" style={{
            padding: 12,
            background: payload.lowCashAlert.triggered ? '#fde8e4' : '#edf4f8',
            borderRadius: 6,
            fontSize: 14,
            lineHeight: 1.5,
          }}>
            {payload.lowCashAlert.triggered ? (
              <><b>Warning:</b> {payload.lowCashAlert.explanation}</>
            ) : (
              <>{payload.lowCashAlert.explanation}</>
            )}
          </p>
        </div>
      </div>

      <h2 className="h2" style={{ fontSize: 20, marginBottom: 12 }}>Key inflows &amp; outflows (13-week totals)</h2>
      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="cardTitle">Total modeled inflows</div>
          <p className="cardBody" style={{ fontSize: 22, fontWeight: 600 }}>{usd(payload.summary.totalInflows)}</p>
          <p className="cardBody" style={{ fontSize: 13 }}>Grants + donations scheduled by week.</p>
        </div>
        <div className="card">
          <div className="cardTitle">Total modeled outflows</div>
          <p className="cardBody" style={{ fontSize: 22, fontWeight: 600 }}>{usd(payload.summary.totalOutflows)}</p>
          <p className="cardBody" style={{ fontSize: 13 }}>Payroll + recurring operating expenses on cadence.</p>
        </div>
        <div className="card">
          <div className="cardTitle">Net over horizon</div>
          <p className="cardBody" style={{ fontSize: 22, fontWeight: 600 }}>{usd(payload.summary.netOverHorizon)}</p>
          <p className="cardBody" style={{ fontSize: 13 }}>Inflows minus outflows (not revenue recognition).</p>
        </div>
      </div>

      <h2 className="h2" style={{ fontSize: 20, marginBottom: 12 }}>Highest-risk weeks (deterministic ranking)</h2>
      <p style={{ fontSize: 14, marginBottom: 12, color: '#5f7080' }}>
        Weeks sorted by below-threshold flag, then lowest ending cash. Explanations come from the forecast engine.
      </p>
      <ol style={{ margin: '0 0 24px', paddingLeft: 22, fontSize: 14, lineHeight: 1.55 }}>
        {payload.highestRiskWeeks.map(w => (
          <li key={w.weekNumber} style={{ marginBottom: 10 }}>
            <b>Week {w.weekNumber}</b>
            {w.belowThreshold ? ' — below threshold' : ''}
            {' — '}
            {usd(w.endingCash)}
            <div style={{ marginTop: 4, color: '#243647' }}>{w.explanation}</div>
          </li>
        ))}
      </ol>

      <h2 className="h2" style={{ fontSize: 20, marginBottom: 12 }}>13-week ending cash trend</h2>
      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #d8e1e8', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>Week</th>
              <th style={{ padding: '8px 6px' }}>Ending cash</th>
              <th style={{ padding: '8px 6px' }}>Below threshold</th>
            </tr>
          </thead>
          <tbody>
            {payload.weeklyEndingCashTrend.map(row => (
              <tr
                key={row.weekNumber}
                style={{
                  borderBottom: '1px solid #eef2f5',
                  background: row.belowThreshold ? '#fff3df' : undefined,
                }}
              >
                <td style={{ padding: '8px 6px' }}>{row.weekNumber}</td>
                <td style={{ padding: '8px 6px' }}>{usd(row.endingCash)}</td>
                <td style={{ padding: '8px 6px' }}>{row.belowThreshold ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="h2" style={{ fontSize: 20, marginBottom: 12 }}>Assumptions &amp; calculation basis</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="cardBody" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>
          {payload.methodology}
        </p>
        <p className="cardBody" style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>
          <b>Grant inflows:</b>{' '}
          {payload.assumptions.expected_grant_inflows.length === 0
            ? 'none'
            : payload.assumptions.expected_grant_inflows.map(e => `W${e.week} ${usd(e.amount)}${e.label ? ` (${e.label})` : ''}`).join('; ')}
          {'\n'}
          <b>Donation inflows:</b>{' '}
          {payload.assumptions.expected_donation_inflows.length === 0
            ? 'none'
            : payload.assumptions.expected_donation_inflows.map(e => `W${e.week} ${usd(e.amount)}${e.label ? ` (${e.label})` : ''}`).join('; ')}
          {'\n'}
          <b>Payroll:</b> {payload.assumptions.payroll_schedule.cadence},{' '}
          {usd(payload.assumptions.payroll_schedule.amount)} starting week{' '}
          {payload.assumptions.payroll_schedule.first_payment_week}
          {'\n'}
          <b>Recurring expenses:</b>{' '}
          {payload.assumptions.recurring_operating_expenses.map(
            e => `${e.name} ${usd(e.amount)} / ${e.cadence} from W${e.first_due_week}`
          ).join('; ') || 'none'}
          {payload.assumptions.reserve_threshold_target !== undefined
            ? `\n<b>Reserve target:</b> ${usd(payload.assumptions.reserve_threshold_target)}`
            : ''}
        </p>
      </div>

      <p style={{ fontSize: 13, color: '#5f7080', lineHeight: 1.55, marginBottom: 24 }}>
        <b>Operational caveat:</b> {payload.caveat}
      </p>

      <p style={{ fontSize: 13 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

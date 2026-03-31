import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type RestrictedFundListItem = {
  id: string;
  name: string;
  sourceName: string;
  totalRestrictedAmountUsd: number;
  startDate: string;
  endDate: string;
};

type RestrictedFundSummary = {
  fund: RestrictedFundListItem & {
    restrictionPurpose: string;
  };
  computed: {
    remainingBalanceUsd: number;
    totalUsedUsd: number;
    period: {
      startDate: string;
      endDate: string;
      daysRemaining: number;
    };
    spendRates: {
      requiredPerDayUsdToFullyUseByEnd: number;
      projectedTotalUsedByEndUsd: number;
    };
    riskFlags: Array<
      'OVERSPENT' | 'UNDERSPEND_RISK' | 'PERIOD_ENDED_WITH_REMAINING_BALANCE' | 'MISSING_PERIOD_DATES'
    >;
    explainability: string[];
  };
  caveat: string;
};

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function toCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDayValue(isoDate: string): number {
  const date = new Date(isoDate);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export default async function RestrictedFundsDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const base = orgDashboardBaseUrl();
  const listResponse = await fetch(`${base}/api/org/restricted-funds`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!listResponse.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Restricted funds dashboard
        </h1>
        <p className="subhead">Could not load restricted fund records ({listResponse.status}).</p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const listPayload = (await listResponse.json()) as { restrictedFunds: RestrictedFundListItem[] };
  const summaries: RestrictedFundSummary[] = [];
  for (const fund of listPayload.restrictedFunds) {
    const summaryResponse = await fetch(`${base}/api/org/restricted-funds/${fund.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!summaryResponse.ok) continue;
    summaries.push((await summaryResponse.json()) as RestrictedFundSummary);
  }

  const now = new Date();
  const activeFunds = summaries.filter(summary => {
    const start = new Date(summary.fund.startDate);
    const end = new Date(summary.fund.endDate);
    return start <= now && now <= end;
  });
  const remainingTotal = summaries.reduce((sum, summary) => sum + summary.computed.remainingBalanceUsd, 0);
  const overSpendRiskFunds = summaries.filter(summary => summary.computed.riskFlags.includes('OVERSPENT'));
  const underSpendRiskFunds = summaries.filter(summary =>
    summary.computed.riskFlags.includes('UNDERSPEND_RISK') ||
    summary.computed.riskFlags.includes('PERIOD_ENDED_WITH_REMAINING_BALANCE')
  );
  const deadlines = summaries
    .map(summary => ({
      id: summary.fund.id,
      name: summary.fund.name,
      endDate: summary.fund.endDate,
      daysRemaining: summary.computed.period.daysRemaining,
    }))
    .sort((left, right) => toDayValue(left.endDate) - toDayValue(right.endDate))
    .slice(0, 8);
  const caveat = summaries[0]?.caveat
    ?? 'This is restricted-fund tracking based on entered usage events; it is not a general ledger or GAAP-complete fund accounting.';

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 32, marginBottom: 8 }}>
        Restricted funds dashboard
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Operational view of restricted-fund balances, deadlines, and deterministic pace risks.
      </p>

      <div className="cards">
        <div className="card">
          <div className="cardTitle">Restricted fund totals</div>
          <p className="cardBody"><b>Total active restricted funds:</b> {activeFunds.length}</p>
          <p className="cardBody"><b>Total restricted balance remaining:</b> {toCurrency(remainingTotal)}</p>
        </div>

        <div className="card">
          <div className="cardTitle">Risk flags</div>
          <p className="cardBody"><b>Over-spend risk funds:</b> {overSpendRiskFunds.length}</p>
          <p className="cardBody"><b>Under-spend / pace risk funds:</b> {underSpendRiskFunds.length}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Upcoming period-end deadlines</div>
        {deadlines.length === 0 ? (
          <p className="cardBody">No restricted funds are tracked yet.</p>
        ) : (
          <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
            {deadlines.map(deadline => (
              <li key={deadline.id}>
                {deadline.name} - {deadline.endDate.slice(0, 10)} ({deadline.daysRemaining} day
                {deadline.daysRemaining === 1 ? '' : 's'} remaining)
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Fund-by-fund status table</div>
        {summaries.length === 0 ? (
          <p className="cardBody">No restricted funds are available.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                  <th style={{ padding: '8px 6px' }}>Fund</th>
                  <th style={{ padding: '8px 6px' }}>Restricted</th>
                  <th style={{ padding: '8px 6px' }}>Used</th>
                  <th style={{ padding: '8px 6px' }}>Remaining</th>
                  <th style={{ padding: '8px 6px' }}>Period</th>
                  <th style={{ padding: '8px 6px' }}>Risk flags</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(summary => (
                  <tr key={summary.fund.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <td style={{ padding: '8px 6px' }}>
                      {summary.fund.name}
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{summary.fund.sourceName}</div>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{toCurrency(summary.fund.totalRestrictedAmountUsd)}</td>
                    <td style={{ padding: '8px 6px' }}>{toCurrency(summary.computed.totalUsedUsd)}</td>
                    <td style={{ padding: '8px 6px' }}>{toCurrency(summary.computed.remainingBalanceUsd)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {summary.computed.period.startDate.slice(0, 10)} to {summary.computed.period.endDate.slice(0, 10)}
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {summary.computed.period.daysRemaining} days remaining
                      </div>
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      {summary.computed.riskFlags.length === 0
                        ? 'None'
                        : summary.computed.riskFlags.map(flag => titleCase(flag)).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Calculation basis</div>
        {summaries.length === 0 ? (
          <p className="cardBody">No deterministic calculations available yet.</p>
        ) : (
          <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
            {summaries[0]!.computed.explainability.slice(0, 5).map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      <p className="subhead" style={{ marginTop: 16 }}>
        {caveat}
      </p>

      <p style={{ fontSize: 13, marginTop: 16 }}>
        <a href="/dashboard">Back to dashboard</a>
      </p>
    </div>
  );
}

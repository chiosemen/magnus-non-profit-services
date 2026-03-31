import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/tokens';
import React from 'react';

export const runtime = 'nodejs';

type AuditPrepItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED';
type AuditPrepCategory =
  | 'GOVERNANCE_BOARD_MINUTES'
  | 'BANK_CASH_RECONCILIATIONS'
  | 'PAYROLL_COMPENSATION'
  | 'GRANT_RESTRICTED_FUNDS'
  | 'CONTRACTS_LEASES_AGREEMENTS'
  | 'PRIOR_YEAR_FINDING_REMEDIATION';
type AuditPrepOverallStatus = 'no_items' | 'blocked' | 'overdue' | 'all_complete' | 'in_progress';

type AuditPrepSnapshot = {
  orgId: string;
  disclaimer: string;
  items: Array<{
    id: string;
    category: AuditPrepCategory;
    title: string;
    status: AuditPrepItemStatus;
    targetDate: string | null;
    assignee: string | null;
    evidenceReference: string | null;
  }>;
  summary: {
    totalItems: number;
    openItems: number;
    blockedItems: number;
    overdueItems: number;
    overallStatus: AuditPrepOverallStatus;
    explanation: string[];
  };
};

type CategoryProgress = {
  category: AuditPrepCategory;
  completeCount: number;
  totalCount: number;
  completionRate: number;
};

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function isOverdue(targetDate: string | null, status: AuditPrepItemStatus, now: Date): boolean {
  if (!targetDate || status === 'COMPLETE') return false;
  const targetDay = Date.UTC(
    new Date(targetDate).getUTCFullYear(),
    new Date(targetDate).getUTCMonth(),
    new Date(targetDate).getUTCDate()
  );
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return targetDay < nowDay;
}

function computeCategoryProgress(items: AuditPrepSnapshot['items']): CategoryProgress[] {
  const byCategory = new Map<AuditPrepCategory, { totalCount: number; completeCount: number }>();

  for (const item of items) {
    const existing = byCategory.get(item.category) ?? { totalCount: 0, completeCount: 0 };
    existing.totalCount += 1;
    if (item.status === 'COMPLETE') existing.completeCount += 1;
    byCategory.set(item.category, existing);
  }

  return Array.from(byCategory.entries())
    .map(([category, counts]) => ({
      category,
      totalCount: counts.totalCount,
      completeCount: counts.completeCount,
      completionRate: counts.totalCount === 0 ? 0 : Math.round((counts.completeCount / counts.totalCount) * 100),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export default async function AuditPrepDashboardPage() {
  const token = cookies().get('session')?.value;
  if (!token) redirect('/login');

  try {
    verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  const response = await fetch(`${orgDashboardBaseUrl()}/api/org/audit-prep`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    return (
      <div className="panel panelPad">
        <h1 className="h1" style={{ fontSize: 28, marginBottom: 8 }}>
          Audit prep dashboard
        </h1>
        <p className="subhead">Could not load audit prep records ({response.status}).</p>
        <p style={{ fontSize: 13, marginTop: 16 }}>
          <a href="/dashboard">Back to dashboard</a>
        </p>
      </div>
    );
  }

  const snapshot = (await response.json()) as AuditPrepSnapshot;
  const now = new Date();
  const categoryProgress = computeCategoryProgress(snapshot.items);
  const priorYearItems = snapshot.items.filter(i => i.category === 'PRIOR_YEAR_FINDING_REMEDIATION');
  const priorYearComplete = priorYearItems.filter(i => i.status === 'COMPLETE').length;
  const priorYearOpen = priorYearItems.filter(i => i.status !== 'COMPLETE').length;
  const priorYearBlocked = priorYearItems.filter(i => i.status === 'BLOCKED').length;
  const priorYearOverdue = priorYearItems.filter(i => isOverdue(i.targetDate, i.status, now)).length;
  const openItems = snapshot.items.filter(i => i.status !== 'COMPLETE');

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 32, marginBottom: 8 }}>
        Audit prep dashboard
      </h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Operational readiness view from tracked audit prep checklist items and statuses.
      </p>

      <div className="cards">
        <div className="card">
          <div className="cardTitle">Overall audit readiness rollup</div>
          <p className="cardBody"><b>Status:</b> {formatLabel(snapshot.summary.overallStatus)}</p>
          <p className="cardBody"><b>Total items:</b> {snapshot.summary.totalItems}</p>
          <p className="cardBody"><b>Open items:</b> {snapshot.summary.openItems}</p>
          <p className="cardBody"><b>Overdue items:</b> {snapshot.summary.overdueItems}</p>
          <p className="cardBody"><b>Blocked items:</b> {snapshot.summary.blockedItems}</p>
        </div>

        <div className="card">
          <div className="cardTitle">Checklist category progress</div>
          {categoryProgress.length === 0 ? (
            <p className="cardBody">No checklist categories yet.</p>
          ) : (
            <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
              {categoryProgress.map(row => (
                <li key={row.category}>
                  {formatLabel(row.category)}: {row.completeCount}/{row.totalCount} complete ({row.completionRate}%)
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="cardTitle">Prior-year finding remediation</div>
          <p className="cardBody"><b>Total prior-year items:</b> {priorYearItems.length}</p>
          <p className="cardBody"><b>Complete:</b> {priorYearComplete}</p>
          <p className="cardBody"><b>Open:</b> {priorYearOpen}</p>
          <p className="cardBody"><b>Blocked:</b> {priorYearBlocked}</p>
          <p className="cardBody"><b>Overdue:</b> {priorYearOverdue}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Rollup explanation</div>
        {snapshot.summary.explanation.length === 0 ? (
          <p className="cardBody">No explanation entries returned.</p>
        ) : (
          <ul style={{ margin: '8px 0 0 18px', fontSize: 14 }}>
            {snapshot.summary.explanation.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="cardTitle">Open audit prep items</div>
        {openItems.length === 0 ? (
          <p className="cardBody">All audit prep items are complete.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(0,0,0,0.12)' }}>
                  <th style={{ padding: '8px 6px' }}>Category</th>
                  <th style={{ padding: '8px 6px' }}>Title</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
                  <th style={{ padding: '8px 6px' }}>Target date</th>
                  <th style={{ padding: '8px 6px' }}>Assignee</th>
                </tr>
              </thead>
              <tbody>
                {openItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                    <td style={{ padding: '8px 6px' }}>{formatLabel(item.category)}</td>
                    <td style={{ padding: '8px 6px' }}>{item.title}</td>
                    <td style={{ padding: '8px 6px' }}>{formatLabel(item.status)}</td>
                    <td style={{ padding: '8px 6px' }}>{item.targetDate ?? 'Not set'}</td>
                    <td style={{ padding: '8px 6px' }}>{item.assignee ?? 'Unassigned'}</td>
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

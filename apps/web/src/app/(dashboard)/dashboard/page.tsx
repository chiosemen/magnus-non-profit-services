import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@magnus/db/client';

export const runtime = 'nodejs';

type Me = {
  userId: string;
  orgId: string;
  role: string;
};

async function fetchMe(): Promise<Me> {
  const cookieHeader = cookies().toString();
  if (!cookieHeader) redirect('/login');

  const host = headers().get('host');
  const proto = headers().get('x-forwarded-proto') ?? 'https';
  const base = host ? `${proto}://${host}` : 'http://localhost:3000';

  const res = await fetch(`${base}/api/me`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (!res.ok) redirect('/login');
  return (await res.json()) as Me;
}

export default async function DashboardPage() {
  const me = await fetchMe();

  const user = await prisma.user.findUnique({ where: { id: me.userId }, select: { email: true } });
  if (!user) redirect('/login');

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Dashboard</h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Authenticated session verified server-side. Tokens are issued at login and enforced by middleware.
      </p>

      <div className="cards">
        <div className="card">
          <div className="cardTitle">Identity</div>
          <p className="cardBody"><b>User ID:</b> {me.userId}</p>
          <p className="cardBody"><b>Email:</b> {user.email}</p>
          <p className="cardBody"><b>Role:</b> {me.role}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Organization</div>
          <p className="cardBody"><b>Org ID:</b> {me.orgId}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Governance</div>
          <p className="cardBody">Track board readiness from live roster, policy, disclosure, and attendance records.</p>
          <p className="cardBody">
            <a href="/dashboard/governance">Open governance dashboard</a>
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Audit prep</div>
          <p className="cardBody">Monitor checklist completion, blockers, and overdue preparation items.</p>
          <p className="cardBody">
            <a href="/dashboard/audit-prep">Open audit prep dashboard</a>
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Form 990 &amp; funder readiness</div>
          <p className="cardBody">990 health score, category breakdown, watchouts, and funder readiness report from your stored filing inputs.</p>
          <p className="cardBody">
            <a href="/dashboard/990-readiness">Open 990 readiness dashboard</a>
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">State registrations</div>
          <p className="cardBody">Track multi-state registration statuses, renewals, and risk reminders.</p>
          <p className="cardBody">
            <a href="/dashboard/state-registrations">Open registration dashboard</a>
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Restricted funds</div>
          <p className="cardBody">Monitor restricted balance, period-end pacing, and deterministic spend risks.</p>
          <p className="cardBody">
            <a href="/dashboard/restricted-funds">Open restricted funds dashboard</a>
          </p>
        </div>
        <div className="card">
          <div className="cardTitle">Cash flow</div>
          <p className="cardBody">13-week deterministic forecast from your stored assumptions: ending cash trend, reserve warning, and inflow/outflow totals.</p>
          <p className="cardBody">
            <a href="/dashboard/cash-flow">Open cash flow dashboard</a>
          </p>
        </div>
      </div>
    </div>
  );
}


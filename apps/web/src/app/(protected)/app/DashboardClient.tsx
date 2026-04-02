'use client';

import { useEffect, useState } from 'react';

type Summary = {
  org: { id: string; ein: string; name: string };
  worker: { id: string; email: string; name: string | null };
};

export default function DashboardClient() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/summary', { cache: 'no-store' });
        if (!res.ok) throw new Error('DASHBOARD_FETCH_FAILED');
        const json = (await res.json()) as Summary;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'DASHBOARD_FETCH_FAILED');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="panel panelPad"><div className="error">{error}</div></div>;
  if (!data) return <div className="panel panelPad">Loading dashboard…</div>;

  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Dashboard</h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        This page reads from `/api/dashboard/summary`, which verifies auth, hits Postgres via `@magnus/db`,
        and returns the org and worker records.
      </p>

      <div className="cards">
        <div className="card">
          <div className="cardTitle">Organization</div>
          <p className="cardBody"><b>Name:</b> {data.org.name}</p>
          <p className="cardBody"><b>EIN:</b> {data.org.ein}</p>
          <p className="cardBody"><b>ID:</b> {data.org.id}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Worker</div>
          <p className="cardBody"><b>Email:</b> {data.worker.email}</p>
          <p className="cardBody"><b>Name:</b> {data.worker.name ?? '—'}</p>
          <p className="cardBody"><b>ID:</b> {data.worker.id}</p>
        </div>
        <div className="card">
          <div className="cardTitle">Backend</div>
          <p className="cardBody">All dashboard data is fetched from `/api/*` endpoints, not direct DB reads from pages.</p>
        </div>
        <div className="card">
          <div className="cardTitle">Onboarding & Pilot Setup</div>
          <ul className="cardBody" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
            <li>Verify <a href="/app/autonomous-ops/directory" style={{textDecoration:'underline'}}>Directory & Memory</a> context files</li>
            <li>Configure <a href="/app/autonomous-ops/connectors" style={{textDecoration:'underline'}}>Connectors</a> for your org</li>
            <li>Review <a href="/app/autonomous-ops/rules" style={{textDecoration:'underline'}}>Authority Rules</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}


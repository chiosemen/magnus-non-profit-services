import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="nav">
        <div className="container navInner">
          <Link className="brand" href="/app">
            <span className="brandMark" aria-hidden="true" />
            <span>Magnus App</span>
            <span style={{ marginLeft: 8, padding: '2px 6px', background: '#8a2be2', color: '#fff', fontSize: 11, borderRadius: 4, fontWeight: 'bold' }}>PILOT</span>
          </Link>
          <nav className="navLinks">
            <Link className="pill pillPrimary" href="/app/donors">Donors & CRM</Link>
            <Link className="pill" href="/app/campaigns">Campaigns</Link>
            <Link className="pill" href="/app/accounting">Accounting</Link>
            <Link className="pill" href="/app/autonomous-ops/directory">Directory</Link>
            <Link className="pill" href="/app/autonomous-ops/connectors">Connectors</Link>
            <Link className="pill" href="/app/autonomous-ops/rules">Rules</Link>
            <Link className="pill" href="/app/autonomous-ops/control-tower">Audit</Link>
            <Link className="pill" href="/app/autonomous-ops/operations-log">Ops log</Link>
            <Link className="pill" href="/app/autonomous-ops/readiness">Readiness</Link>
            <Link className="pill" href="/app/autonomous-ops/concierge">Concierge</Link>
            <Link className="pill" href="/app/donors/stripe-connect">Stripe Connect</Link>
            <Link className="pill" href="/">Marketing</Link>
            <Link className="pill" href="/tools">Tools</Link>
            <form action="/api/auth/logout" method="post">
              <button className="pill" type="submit">Logout</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="section">
        <div className="container">{children}</div>
      </main>
    </>
  );
}

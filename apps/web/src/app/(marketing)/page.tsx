import Link from 'next/link';

export default function LandingPage() {
  return (
    <main>
      <section className="hero">
        <div className="container heroGrid">
          <div>
            <h1 className="h1">Nonprofit operations, made auditable.</h1>
            <p className="subhead">
              Magnus helps organizations keep compliance and financial workflows tight: clear status, predictable
              deadlines, and a path from dashboard actions to backend checks and database truth.
            </p>
            <div className="ctaRow">
              <Link className="pill pillPrimary" href="/book-audit">Book Audit</Link>
              <Link className="pill" href="/tools">Tools</Link>
              <Link className="pill" href="/login">Login</Link>
              <Link className="pill" href="/app">Dashboard</Link>
            </div>
          </div>
          <aside className="panel panelPad">
            <div className="kpi">
              <div className="kpiItem">
                <div className="kpiBig">Fail-closed</div>
                <div className="kpiSmall">Guarded routes, safe defaults</div>
              </div>
              <div className="kpiItem">
                <div className="kpiBig">Deterministic</div>
                <div className="kpiSmall">Clean routing and flows</div>
              </div>
              <div className="kpiItem">
                <div className="kpiBig">/api backed</div>
                <div className="kpiSmall">Dashboard uses backend endpoints</div>
              </div>
              <div className="kpiItem">
                <div className="kpiBig">Neon-ready</div>
                <div className="kpiSmall">Postgres via Prisma client</div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cards">
            <div className="card">
              <div className="cardTitle">Audit Trail</div>
              <p className="cardBody">Every dashboard action maps to a backend endpoint. Every endpoint can map to a DB query.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Org and Worker Model</div>
              <p className="cardBody">Built on existing Magnus DB models: Organizations, Workers, and relationships.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Protected App</div>
              <p className="cardBody">The `/app/*` area is guarded by middleware and requires an authenticated session.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}


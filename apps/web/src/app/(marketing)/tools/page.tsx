import Link from 'next/link';

export default function ToolsPage() {
  return (
    <main className="section">
      <div className="container">
        <div className="panel panelPad">
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Tools</h1>
          <p className="subhead" style={{ marginBottom: 18 }}>
            A small overview of what Magnus provides, designed to funnel into booking and onboarding.
          </p>
          <div className="cards">
            <div className="card">
              <div className="cardTitle">Compliance Calendar</div>
              <p className="cardBody">Deadlines tracked centrally and exposed to dashboards via `/api/*` endpoints.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Grant Generator</div>
              <p className="cardBody">Assistive drafting workflows with clear guardrails and environment validation.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Worker Financial Layer</div>
              <p className="cardBody">Worker-level views with tier gating enforced on the server.</p>
            </div>
          </div>
          <div className="ctaRow" style={{ marginTop: 16 }}>
            <Link className="pill pillPrimary" href="/book-audit">Book Audit</Link>
            <Link className="pill" href="/login">Login</Link>
            <Link className="pill" href="/app">Dashboard</Link>
          </div>
        </div>
      </div>
    </main>
  );
}


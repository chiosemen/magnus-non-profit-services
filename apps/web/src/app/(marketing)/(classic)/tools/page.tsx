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
              <p className="cardBody">Filing and reporting deadlines tracked centrally, with clear status your whole team can see.</p>
            </div>
            <div className="card">
              <div className="cardTitle">AI Concierge</div>
              <p className="cardBody">Pilot-controlled drafting and readiness workflows with human approval boundaries.</p>
            </div>
            <div className="card">
              <div className="cardTitle">Board Packets</div>
              <p className="cardBody">Executive prep and board packet drafts grounded in org records and campaign context.</p>
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

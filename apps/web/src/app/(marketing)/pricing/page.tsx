import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="section">
      <div className="container">
        <div className="panel panelPad">
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Pricing</h1>
          <p className="subhead" style={{ marginBottom: 16 }}>
            Charged per organization + worker tier. Everything routes through the dashboard and enforces fail-closed guards via the middleware.
          </p>
          <div className="ctaRow">
            <Link className="pill" href="/app">View Dashboard</Link>
            <Link className="pill" href="/book-audit">Book an Audit</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

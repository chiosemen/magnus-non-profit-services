import Link from 'next/link';

export default function GrantsPage() {
  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Grants</h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Review grant assignments, review endpoints, and keep the partner workflows auditable. All data flows through `/api/grants`.
      </p>
      <div className="ctaRow">
        <Link className="pill" href="/app">Dashboard</Link>
        <Link className="pill" href="/app/compliance">Compliance</Link>
      </div>
    </div>
  );
}

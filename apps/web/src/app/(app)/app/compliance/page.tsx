import Link from 'next/link';

export default function CompliancePage() {
  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Compliance Console</h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Authorized users can surface deadlines, status, and enforcement notes. Every view calls `/api/*` endpoints guarded by
        the middleware and backed by `@magnus/db`.
      </p>
      <div className="ctaRow">
        <Link className="pill" href="/app">Back to Dashboard</Link>
        <Link className="pill" href="/app/grants">Go to Grants</Link>
      </div>
    </div>
  );
}

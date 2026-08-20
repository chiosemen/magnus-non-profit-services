import Link from 'next/link';

export default function BookAuditPage() {
  return (
    <main className="section">
      <div className="container">
        <div className="panel panelPad">
          <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Book an Audit</h1>
          <p className="subhead" style={{ marginBottom: 0 }}>
            Use this page as the conversion step. For now it routes cleanly and can be wired to scheduling later.
          </p>
          <div className="ctaRow" style={{ marginTop: 16 }}>
            <Link className="pill pillPrimary" href="/login">Staff Login</Link>
            <Link className="pill" href="mailto:hello@magnusnonprofitservices.com">Request access</Link>
          </div>
        </div>
      </div>
    </main>
  );
}


import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Settings</h1>
      <p className="subhead" style={{ marginBottom: 16 }}>
        Manage your worker profile, rotate the `session` cookie, and configure compliance notifications securely.
      </p>
      <div className="ctaRow">
        <Link className="pill" href="/app">Dashboard</Link>
        <Link className="pill" href="/app/compliance">Compliance</Link>
      </div>
    </div>
  );
}

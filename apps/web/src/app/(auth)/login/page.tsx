import Link from 'next/link';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Login</h1>
      <p className="subhead" style={{ marginBottom: 0 }}>
        This login uses existing Organization + Worker records. If you don’t have an account, register first.
      </p>
      <LoginForm />
      <div style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>
        No account? <Link className="pill" href="/register">Register</Link>
      </div>
    </div>
  );
}


import Link from 'next/link';
import { Suspense } from 'react';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Login</h1>
      <p className="subhead" style={{ marginBottom: 0 }}>
        Sign in with your email and password. If you don’t have an account, register first.
      </p>
      <Suspense fallback={<div className="subhead" style={{ marginTop: 10 }}>Loading…</div>}>
        <LoginForm />
      </Suspense>
      <div style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>
        No account? <Link className="pill" href="/register">Register</Link>
      </div>
    </div>
  );
}

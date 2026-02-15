import Link from 'next/link';
import RegisterForm from './RegisterForm';

export default function RegisterPage() {
  return (
    <div className="panel panelPad">
      <h1 className="h1" style={{ fontSize: 34, marginBottom: 10 }}>Register</h1>
      <p className="subhead" style={{ marginBottom: 0 }}>
        Creates an Organization and a Worker record and signs you into the dashboard.
      </p>
      <RegisterForm />
      <div style={{ marginTop: 14, color: 'var(--muted)', fontSize: 13 }}>
        Already have an account? <Link className="pill" href="/login">Login</Link>
      </div>
    </div>
  );
}


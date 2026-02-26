'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterForm() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [ein, setEin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgName, ein, name, email, password }),
      });
      if (!res.ok) {
        const body = await safeJson(res);
        throw new Error(body?.error || 'REGISTER_FAILED');
      }
      router.push('/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'REGISTER_FAILED');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <div className="label">Organization Name</div>
        <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Magnus Community Org" required />
      </div>
      <div className="field">
        <div className="label">Organization EIN</div>
        <input className="input" value={ein} onChange={e => setEin(e.target.value)} placeholder="12-3456789" required />
      </div>
      <div className="field">
        <div className="label">Your Name (optional)</div>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
      </div>
      <div className="field">
        <div className="label">Email</div>
        <input className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@org.org" required />
      </div>
      <div className="field">
        <div className="label">Password</div>
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required />
      </div>
      {error ? <div className="error">{error}</div> : null}
      <button className="pill pillPrimary" type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create Account'}
      </button>
    </form>
  );
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}


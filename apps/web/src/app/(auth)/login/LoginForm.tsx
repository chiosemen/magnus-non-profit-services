'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = useMemo(() => search.get('next') || '/app', [search]);

  const [ein, setEin] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ein, email }),
      });
      if (!res.ok) {
        const body = await safeJson(res);
        throw new Error(body?.error || 'LOGIN_FAILED');
      }
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LOGIN_FAILED');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <div className="label">Organization EIN</div>
        <input className="input" value={ein} onChange={e => setEin(e.target.value)} placeholder="12-3456789" required />
      </div>
      <div className="field">
        <div className="label">Email</div>
        <input className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@org.org" required />
      </div>
      {error ? <div className="error">{error}</div> : null}
      <button className="pill pillPrimary" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Login'}
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


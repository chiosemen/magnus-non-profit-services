'use client';

export default function LoginForm() {
  return (
    <form className="form" action="/api/login" method="POST">
      <div className="field">
        <div className="label">Email</div>
        <input className="input" name="email" type="email" placeholder="you@org.org" required />
      </div>
      <div className="field">
        <div className="label">Password</div>
        <input className="input" name="password" type="password" placeholder="••••••••" minLength={8} required />
      </div>
      <button className="pill pillPrimary" type="submit">
        Login
      </button>
    </form>
  );
}

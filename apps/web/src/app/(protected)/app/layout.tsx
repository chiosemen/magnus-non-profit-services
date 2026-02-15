import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="nav">
        <div className="container navInner">
          <Link className="brand" href="/app">
            <span className="brandMark" aria-hidden="true" />
            <span>Magnus App</span>
          </Link>
          <nav className="navLinks">
            <Link className="pill" href="/">Marketing</Link>
            <Link className="pill" href="/tools">Tools</Link>
            <form action="/api/auth/logout" method="post">
              <button className="pill" type="submit">Logout</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="section">
        <div className="container">{children}</div>
      </main>
    </>
  );
}


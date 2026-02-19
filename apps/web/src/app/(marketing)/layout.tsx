import type { ReactNode } from 'react';
import Link from 'next/link';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="nav">
        <div className="container navInner">
          <Link className="brand" href="/">
            <span className="brandMark" aria-hidden="true" />
            <span>Magnus</span>
          </Link>
          <nav className="navLinks">
            <Link className="pill" href="/tools">Tools</Link>
            <Link className="pill" href="/book-audit">Book Audit</Link>
            <Link className="pill" href="/login">Login</Link>
            <Link className="pill pillPrimary" href="/app">Dashboard</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="container">
          <div>Magnus Nonprofit Services. Compliance, finance, and operations tooling for nonprofits.</div>
        </div>
      </footer>
    </>
  );
}


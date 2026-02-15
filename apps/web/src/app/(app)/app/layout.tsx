import type { ReactNode } from 'react';
import Link from 'next/link';

const APP_NAV = [
  { label: 'Dashboard', href: '/app' },
  { label: 'Compliance', href: '/app/compliance' },
  { label: 'Grants', href: '/app/grants' },
  { label: 'Settings', href: '/app/settings' },
];

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
            {APP_NAV.map(item => (
              <Link key={item.href} className="pill" href={item.href}>
                {item.label}
              </Link>
            ))}
            <Link className="pill" href="/">
              Marketing
            </Link>
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

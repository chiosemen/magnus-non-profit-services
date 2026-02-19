import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="section">
      <div className="container">
        <div style={{ marginBottom: 16 }}>
          <Link className="brand" href="/">
            <span className="brandMark" aria-hidden="true" />
            <span>Magnus</span>
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}


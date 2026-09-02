import type { ReactNode } from 'react';
import Link from 'next/link';
import { MobileNavToggle } from './components/MobileNav';
import './accord.css';

/**
 * Chrome for the Magnus Accord marketing surface (home, /book-audit, /snapshot).
 * The classic chrome for /tools and the donor-facing campaign pages lives
 * untouched in the (classic) route group.
 */
export default function AccordLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ac-page">
      <a href="#ac-main" className="ac-skip">
        Skip to content
      </a>

      <header className="ac-nav">
        <div className="ac-nav-inner">
          <Link href="/" className="ac-wordmark">
            <span className="ac-wordmark-mark" aria-hidden="true" />
            Magnus Accord
          </Link>

          <nav className="ac-nav-links" aria-label="Primary">
            <a href="/#product">Product</a>
            <a href="/#how-it-works">How It Works</a>
            <a href="/#assurance">Assurance</a>
            <a href="/#beta">Design Partner Beta</a>
            <a href="/snapshot">Free Snapshot</a>
          </nav>

          <div className="ac-nav-actions">
            <Link href="/login" className="ac-btn ac-btn--quiet">
              Log in
            </Link>
            <Link href="/book-audit" className="ac-btn ac-btn--primary">
              Apply for Beta
            </Link>
          </div>

          <MobileNavToggle />
        </div>
      </header>

      <main id="ac-main">{children}</main>

      <footer className="ac-footer">
        <div className="ac-container">
          <div className="ac-footer-grid">
            <div>
              <span className="ac-wordmark" style={{ minHeight: 0 }}>
                <span className="ac-wordmark-mark" aria-hidden="true" />
                Magnus Accord
              </span>
              <p>
                A bounded, human-governed operating and assurance layer for mission-driven
                organizations. AI prepares the work; your team retains authority.
              </p>
            </div>
            <nav aria-label="Footer, product">
              <h2 className="ac-footer-heading">Product</h2>
              <ul>
                <li><a href="/#product">Action Hub</a></li>
                <li><a href="/#how-it-works">How It Works</a></li>
                <li><a href="/#assurance">Assurance</a></li>
                <li><a href="/#beta">Design Partner Beta</a></li>
              </ul>
            </nav>
            <nav aria-label="Footer, access">
              <h2 className="ac-footer-heading">Access</h2>
              <ul>
                <li><Link href="/book-audit">Apply for Beta</Link></li>
                <li><Link href="/snapshot">Free Snapshot</Link></li>
                <li><Link href="/login">Log in</Link></li>
              </ul>
            </nav>
          </div>
          <div className="ac-footer-bottom">
            <span>© 2026 Magnus Nonprofit Services. Private beta — not generally available.</span>
            <span>Accord does not move money, submit reports, or contact donors on its own.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

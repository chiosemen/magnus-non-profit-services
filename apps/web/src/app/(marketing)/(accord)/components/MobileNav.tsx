'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';

const LINKS = [
  { href: '/#product', label: 'Product' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/#assurance', label: 'Assurance' },
  { href: '/#beta', label: 'Design Partner Beta' },
  { href: '/snapshot', label: 'Free Snapshot' },
];

export function MobileNavToggle() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="ac-nav-toggle"
        aria-expanded={open}
        aria-controls="ac-mobile-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'x' : 'menu'} size={20} />
      </button>

      <nav id="ac-mobile-menu" className="ac-nav-mobile" data-open={open} aria-label="Primary, mobile">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <Link href="/book-audit" className="ac-btn ac-btn--primary" onClick={() => setOpen(false)}>
          Apply for the Design Partner Beta
        </Link>
      </nav>
    </>
  );
}

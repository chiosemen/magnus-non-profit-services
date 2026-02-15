import type { ReactNode } from 'react';
import './globals.css';
import { validateEnv } from '@magnus/config';

export const metadata = {
  title: 'Magnus',
  description: 'Magnus Nonprofit OS',
};

export const runtime = 'nodejs';

validateEnv('web');

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

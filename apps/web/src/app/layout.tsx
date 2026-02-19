import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Magnus',
  description: 'Magnus Nonprofit OS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


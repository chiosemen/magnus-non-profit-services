import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/', req.url));
  clearAuthCookies(res);
  return res;
}


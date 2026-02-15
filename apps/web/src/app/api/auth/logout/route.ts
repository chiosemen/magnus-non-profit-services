import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  cookies().set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 0,
  });
  return new Response(null, {
    status: 303,
    headers: { location: '/login' },
  });
}

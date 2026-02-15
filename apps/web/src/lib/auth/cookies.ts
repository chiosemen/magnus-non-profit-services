import type { NextResponse } from 'next/server';

const ACCESS_COOKIE_NAME = 'session';
const REFRESH_COOKIE_NAME = 'refresh';

type ResponseWithCookies = Pick<NextResponse, 'cookies'>;

function isProduction(): boolean {
  const env = process.env.NODE_ENV;
  if (!env) throw new Error('NODE_ENV must be set');
  return env === 'production';
}

function assertCookieToken(token: unknown): asserts token is string {
  if (typeof token !== 'string' || token.trim().length === 0) throw new Error('Invalid token');
}

function setCookie(res: ResponseWithCookies, name: string, value: string, maxAge?: number): void {
  res.cookies.set({
    name,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    ...(typeof maxAge === 'number' ? { maxAge } : {}),
  });
}

export function setAccessCookie(res: ResponseWithCookies, token: string): void {
  assertCookieToken(token);
  setCookie(res, ACCESS_COOKIE_NAME, token);
}

export function setRefreshCookie(res: ResponseWithCookies, token: string): void {
  assertCookieToken(token);
  setCookie(res, REFRESH_COOKIE_NAME, token);
}

export function clearAuthCookies(res: ResponseWithCookies): void {
  // Explicitly expire both cookies.
  setCookie(res, ACCESS_COOKIE_NAME, '', 0);
  setCookie(res, REFRESH_COOKIE_NAME, '', 0);
}


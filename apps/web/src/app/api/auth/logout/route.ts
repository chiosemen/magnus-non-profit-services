import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { revokeSession } from '@/lib/session';
import { validateCsrfOrigin, csrfRejectionResponse } from '@/lib/csrf';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // ── CSRF origin enforcement ────────────────────────────────────────
  if (!validateCsrfOrigin(req)) return csrfRejectionResponse();

  // Extract sessionId from JWT before clearing cookie — revoke server-side session
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    try {
      const payload = verifyAppToken(token);
      if (payload.sessionId) {
        await revokeSession(payload.sessionId);
      }
    } catch {
      // JWT invalid or expired — proceed with cookie clear anyway
    }
  }

  cookies().set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 0,
  });
  cookies().set({
    name: REFRESH_COOKIE_NAME,
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

import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  try {
    const payload = verifyAppToken(token);
    return Response.json({ ok: true, payload });
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }
}


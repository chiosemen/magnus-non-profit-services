import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/tokens';

export const runtime = 'nodejs';

export async function GET() {
  const token = cookies().get('session')?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  try {
    const payload = verifyAccessToken(token);
    return Response.json(payload);
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }
}


import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession, validateMembership } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  try {
    const payload = verifyAppToken(token);

    // INV-2: Session exists, not revoked, not expired
    const session = await verifySession(payload.sessionId);
    if (!session) {
      return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
    }

    // INV-3: orgId cross-check — detect tampered JWT
    if (payload.orgId !== session.orgId) {
      return Response.json({ error: 'SESSION_ORG_MISMATCH' }, { status: 401 });
    }

    // INV-4: membership still active
    const isMember = await validateMembership(payload.workerId, payload.orgId);
    if (!isMember) {
      return Response.json({ error: 'MEMBERSHIP_REVOKED' }, { status: 401 });
    }

    return Response.json({ ok: true, payload });
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }
}

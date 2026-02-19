import { prisma } from '@magnus/db/client';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let payload: { orgId: string; workerId: string };
  try {
    const p = verifyAppToken(token);

    // Session-state enforcement: verify session before any DB access
    if (!p.sessionId) {
      return Response.json({ error: 'SESSION_MISSING' }, { status: 401 });
    }
    const session = await verifySession(p.sessionId);
    if (!session) {
      return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
    }

    payload = { orgId: p.orgId, workerId: p.workerId };
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: payload.orgId },
    select: { id: true, ein: true, name: true },
  });
  const worker = await prisma.worker.findUnique({
    where: { id: payload.workerId },
    select: { id: true, email: true, name: true },
  });

  if (!org || !worker) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

  return Response.json({ org, worker });
}

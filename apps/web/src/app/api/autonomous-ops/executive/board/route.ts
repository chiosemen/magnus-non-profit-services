import prisma from '@magnus/db/client';
import { buildExecutiveBoard } from '@magnus/org-autonomous-ops-context';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let payload: { orgId: string; workerId: string };
  try {
    const p = verifyAppToken(token);

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

  const url = new URL(req.url);
  const rawTake = url.searchParams.get('take');
  const take = rawTake ? Math.min(200, Math.max(1, parseInt(String(rawTake), 10))) : 50;

  try {
    const board = await buildExecutiveBoard({ db: prisma as any, orgId: payload.orgId, take, now: new Date() });
    return Response.json(board);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNKNOWN_ALERT_SEVERITY') {
      return Response.json({ error: 'UNKNOWN_ALERT_SEVERITY' }, { status: 500 });
    }
    throw err;
  }
}


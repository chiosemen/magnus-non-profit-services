import { prisma } from '@magnus/db/client';
import { buildPilotReadiness } from '@magnus/org-autonomous-ops-context';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export const runtime = 'nodejs';

const READINESS_DISCLAIMER =
  'Read-only pilot readiness. Dimensions are derived from current org data (subscription, context files, settings, connectors, memory aggregates). They are not a guarantee of production readiness and never imply green without evidence.';

export async function GET() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let payload: { orgId: string };
  try {
    const p = verifyAppToken(token);
    if (!p.sessionId) return Response.json({ error: 'SESSION_MISSING' }, { status: 401 });
    const session = await verifySession(p.sessionId);
    if (!session) return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
    payload = { orgId: p.orgId };
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const snapshot = await buildPilotReadiness({
    db: prisma as any,
    orgId: payload.orgId,
    now: new Date(),
  });

  return Response.json({
    disclaimer: READINESS_DISCLAIMER,
    ...snapshot,
  });
}

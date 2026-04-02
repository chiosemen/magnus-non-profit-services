import { prisma } from '@magnus/db/client';
import { buildOperationsLog } from '@magnus/org-autonomous-ops-context';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export const runtime = 'nodejs';

function parseTake(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, 200);
}

function parseIsoDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function parseCommaList(raw: string | null): string[] | null {
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

export async function GET(req: Request) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let payload: { orgId: string; workerId: string };
  try {
    const p = verifyAppToken(token);
    if (!p.sessionId) return Response.json({ error: 'SESSION_MISSING' }, { status: 401 });
    const session = await verifySession(p.sessionId);
    if (!session) return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
    payload = { orgId: p.orgId, workerId: p.workerId };
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const url = new URL(req.url);
  const take = parseTake(url.searchParams.get('take'));
  const since = parseIsoDate(url.searchParams.get('since'));
  const until = parseIsoDate(url.searchParams.get('until'));
  if (url.searchParams.get('since') && !since) return Response.json({ error: 'INVALID_SINCE' }, { status: 400 });
  if (url.searchParams.get('until') && !until) return Response.json({ error: 'INVALID_UNTIL' }, { status: 400 });

  const agentNames = parseCommaList(url.searchParams.get('agentName'));
  const types = parseCommaList(url.searchParams.get('type')) as any;
  const includeObligationSnapshot = url.searchParams.get('includeObligations') === 'false' ? false : true;

  const out = await buildOperationsLog({
    db: prisma as any,
    orgId: payload.orgId,
    take,
    since,
    until,
    agentNames,
    types,
    includeObligationSnapshot,
    now: new Date(),
  });

  return Response.json(out);
}


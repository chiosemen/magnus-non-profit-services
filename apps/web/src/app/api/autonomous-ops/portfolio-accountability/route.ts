import prisma from '@magnus/db/client';
import {
  buildPortfolioAccountabilitySnapshot,
  EXECUTIVE_BOARD_COMPLIANCE_DUE_SOON_DAYS,
} from '@magnus/org-autonomous-ops-context';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export const runtime = 'nodejs';

function clampDueSoonDays(raw: string | null): number {
  const d = raw ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(d)) return EXECUTIVE_BOARD_COMPLIANCE_DUE_SOON_DAYS;
  return Math.min(180, Math.max(1, d));
}

export async function GET(req: Request) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let orgId: string;
  try {
    const p = verifyAppToken(token);

    if (!p.sessionId) {
      return Response.json({ error: 'SESSION_MISSING' }, { status: 401 });
    }
    const session = await verifySession(p.sessionId);
    if (!session) {
      return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
    }

    orgId = p.orgId;
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dueSoonDays = clampDueSoonDays(url.searchParams.get('dueSoonDays'));

  const snapshot = await buildPortfolioAccountabilitySnapshot({
    db: prisma as any,
    orgId,
    now: new Date(),
    dueSoonDays,
  });

  return Response.json({
    orgId,
    dueSoonDays,
    ...snapshot,
  });
}

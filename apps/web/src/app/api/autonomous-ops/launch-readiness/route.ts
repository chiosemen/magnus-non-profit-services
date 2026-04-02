import { prisma } from '@magnus/db/client';
import { buildLaunchReadinessReport } from '@magnus/org-autonomous-ops-context';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export const runtime = 'nodejs';

const DISCLAIMER =
  'Launch readiness is a deterministic read model; NOT_READY means do not claim green. See packages/org-autonomous-ops-context/src/launchReadiness.ts.';

export async function GET(req: Request) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let orgId: string;
  try {
    const p = verifyAppToken(token);
    if (!p.sessionId) return Response.json({ error: 'SESSION_MISSING' }, { status: 401 });
    const session = await verifySession(p.sessionId);
    if (!session) return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
    orgId = p.orgId;
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const url = new URL(req.url);
  const pilotRequiresLedgerSignal = url.searchParams.get('requireLedger') === '1' || url.searchParams.get('requireLedger') === 'true';
  const treatClaudeAsOptional = url.searchParams.get('claudeOptional') === '1' || url.searchParams.get('claudeOptional') === 'true';

  const report = await buildLaunchReadinessReport({
    db: prisma as any,
    orgId,
    pilotRequiresLedgerSignal,
    treatClaudeAsOptional,
  });

  return Response.json({ disclaimer: DISCLAIMER, ...report });
}

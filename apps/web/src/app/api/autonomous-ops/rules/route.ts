import { prisma } from '@magnus/db/client';
import {
  buildAutonomyPolicySurface,
  getLaunchAgentPolicyRows,
} from '@magnus/org-autonomous-ops-context';
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
    if (!p.sessionId) return Response.json({ error: 'SESSION_MISSING' }, { status: 401 });
    const session = await verifySession(p.sessionId);
    if (!session) return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
    payload = { orgId: p.orgId, workerId: p.workerId };
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const settings = await prisma.orgAutonomousOpsSettings.findUnique({
    where: { orgId: payload.orgId },
    select: { maxAutonomyTier: true, enabledAgents: true, agentBoundaryOverrides: true },
  });

  return Response.json({
    settings,
    launchAgents: getLaunchAgentPolicyRows(),
    autonomyPolicySurface: buildAutonomyPolicySurface(),
  });
}

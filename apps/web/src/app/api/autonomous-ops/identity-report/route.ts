import type { OrgContextFileKind } from '@magnus/db/types';
import { prisma } from '@magnus/db/client';
import { OrgIdentityFilesService, buildOrgContextValidationReport } from '@magnus/org-autonomous-ops-context';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { verifySession } from '@/lib/session';

export const runtime = 'nodejs';

/** Report-only JSON for scripts; same validation as `GET /api/autonomous-ops/directory` → `report`. */
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

  const svc = new OrgIdentityFilesService(prisma as any);
  const [orgRow, files] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: payload.orgId },
      select: { annualRevenue: true },
    }),
    svc.list(payload.orgId, { ensureDefaults: true }),
  ]);

  const annualRevenueUsdSnapshot =
    orgRow?.annualRevenue === null || orgRow?.annualRevenue === undefined ? null : Number(orgRow.annualRevenue);
  const filesByKind = Object.fromEntries(files.map(f => [f.kind, { content: f.content }])) as Partial<
    Record<OrgContextFileKind, { content: string }>
  >;
  const report = buildOrgContextValidationReport({
    orgId: payload.orgId,
    filesByKind,
    annualRevenueUsdSnapshot,
  });

  return Response.json({ orgId: payload.orgId, report });
}

import { prisma } from '@magnus/db/client';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, signAppToken } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await safeJson(req);
  const ein = typeof body?.ein === 'string' ? body.ein.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!ein || !email) return Response.json({ error: 'INVALID_INPUT' }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { ein } });
  if (!org) return Response.json({ error: 'ORG_NOT_FOUND' }, { status: 401 });

  const worker = await prisma.worker.findUnique({ where: { email } });
  if (!worker) return Response.json({ error: 'WORKER_NOT_FOUND' }, { status: 401 });

  const rel = await prisma.workerOrgRelationship.findFirst({
    where: { orgId: org.id, workerId: worker.id },
    select: { id: true },
  });
  if (!rel) return Response.json({ error: 'NOT_ASSOCIATED' }, { status: 401 });

  const token = signAppToken({ orgId: org.id, workerId: worker.id, role: 'admin', sub: worker.id });
  cookies().set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
  });

  return Response.json({ ok: true });
}

async function safeJson(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}


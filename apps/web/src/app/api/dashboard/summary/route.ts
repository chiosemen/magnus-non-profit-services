import { prisma } from '@magnus/db/client';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/tokens';

export const runtime = 'nodejs';

export async function GET() {
  const token = cookies().get('session')?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let payload: { orgId: string; userId: string };
  try {
    const p = verifyAccessToken(token);
    payload = { orgId: p.orgId, userId: p.userId };
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  // userId maps to worker.id (set during registration)
  const org = await prisma.organization.findUnique({
    where: { id: payload.orgId },
    select: { id: true, ein: true, name: true },
  });
  const worker = await prisma.worker.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true },
  });

  if (!org || !worker) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });

  return Response.json({ org, worker });
}

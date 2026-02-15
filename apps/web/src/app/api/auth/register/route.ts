import { prisma } from '@magnus/db/client';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, signAppToken } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await safeJson(req);
  const orgName = typeof body?.orgName === 'string' ? body.orgName.trim() : '';
  const ein = typeof body?.ein === 'string' ? body.ein.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!orgName || !ein || !email) return Response.json({ error: 'INVALID_INPUT' }, { status: 400 });

  // Create minimal records using existing schema defaults and required fields.
  // NOTE: This is intentionally simple to avoid schema/domain changes.
  const { org, worker } = await prisma.$transaction(async tx => {
    const org = await tx.organization.upsert({
      where: { ein },
      update: { name: orgName },
      create: {
        ein,
        name: orgName,
        subscriptionTier: 'STARTER',
      },
    });

    const worker = await tx.worker.upsert({
      where: { email },
      update: { ...(name ? { name } : {}) },
      create: { email, ...(name ? { name } : {}) },
    });

    const existing = await tx.workerOrgRelationship.findFirst({ where: { orgId: org.id, workerId: worker.id } });
    if (!existing) {
      await tx.workerOrgRelationship.create({
        data: {
          workerId: worker.id,
          orgId: org.id,
          relationshipType: 'CONTRACTOR_1099',
          startDate: new Date(),
          grantFunded: false,
        },
      });
    }

    return { org, worker };
  });

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

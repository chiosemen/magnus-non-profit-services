import { prisma } from '@magnus/db/client';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME, signAppToken } from '@/lib/auth';
import { createSession } from '@/lib/session';
import { validateCsrfOrigin, csrfRejectionResponse } from '@/lib/csrf';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  // ── CSRF origin enforcement ────────────────────────────────────────
  if (!validateCsrfOrigin(req)) return csrfRejectionResponse();


  const body = await safeJson(req);
  const orgName = typeof body?.orgName === 'string' ? body.orgName.trim() : '';
  const ein = typeof body?.ein === 'string' ? body.ein.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!orgName || !ein || !email) return Response.json({ error: 'INVALID_INPUT' }, { status: 400 });

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: 'PASSWORD_TOO_SHORT' }, { status: 400 });
  }

  // Hash raw password — no trim/toLowerCase on password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Create minimal records using existing schema defaults and required fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tx type resolved after prisma generate
  const { org, worker } = await prisma.$transaction(async (tx: any) => {
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
      update: { ...(name ? { name } : {}), passwordHash },
      create: { email, passwordHash, ...(name ? { name } : {}) },
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

  // Create server-side session row bound to the verified org
  const { sessionId, refreshToken } = await createSession(worker.id, org.id);

  const token = signAppToken({ orgId: org.id, workerId: worker.id, role: 'admin', sub: worker.id, sessionId });
  cookies().set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 900, // 15 minutes — aligned with JWT exp
  });

  cookies().set({
    name: REFRESH_COOKIE_NAME,
    value: refreshToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
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

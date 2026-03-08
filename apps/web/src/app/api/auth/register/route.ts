import { NextResponse } from 'next/server';
import { prisma } from '@magnus/db/client';
import { signAccessToken } from '@/lib/auth/tokens';
import { generateRefreshToken, hashRefreshToken } from '@/lib/auth/refresh';
import { setAccessCookie, setRefreshCookie } from '@/lib/auth/cookies';
import { hashPassword } from '@/lib/auth/password';
import type { AuthPayload } from '@/lib/auth/types';

export const runtime = 'nodejs';

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  const body = await safeJson(req);
  const orgName = typeof body?.orgName === 'string' ? body.orgName.trim() : '';
  const ein = typeof body?.ein === 'string' ? body.ein.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!orgName || !ein || !email || !password) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  // Validate password strength
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: 'PASSWORD_TOO_SHORT' }, { status: 400 });
  }

  const passwordHashValue = await hashPassword(password);

  try {
    // Create minimal records using existing schema defaults and required fields.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tx type resolved after prisma generate
    const { org, worker, user } = await prisma.$transaction(async (tx: any) => {
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
        update: { ...(name ? { name } : {}), passwordHash: passwordHashValue },
        create: { email, passwordHash: passwordHashValue, ...(name ? { name } : {}) },
      });

      const existing = await tx.workerOrgRelationship.findFirst({
        where: { orgId: org.id, workerId: worker.id },
      });
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

      const user = await tx.user.upsert({
        where: { email },
        update: { name: name || null, passwordHash: passwordHashValue },
        create: { id: worker.id, email, name: name || null, passwordHash: passwordHashValue },
      });

      return { user, org, worker };
    });

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30d

    await prisma.session.create({
      data: {
        userId: user.id,
        orgId: org.id,
        refreshTokenHash,
        expiresAt,
        lastSeenAt: now,
      },
    });

    const payload: AuthPayload = { userId: user.id, orgId: org.id, role: 'user' };
    const accessToken = signAccessToken(payload);

    const res = NextResponse.json({ ok: true });
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);
    return res;
  } catch (err) {
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}

async function safeJson(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

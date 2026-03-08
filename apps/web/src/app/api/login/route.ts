import { NextResponse } from 'next/server';
import { prisma } from '@magnus/db/client';
import { signAccessToken } from '@/lib/auth/tokens';
import { generateRefreshToken, hashRefreshToken } from '@/lib/auth/refresh';
import { setAccessCookie, setRefreshCookie } from '@/lib/auth/cookies';
import { verifyPassword } from '@/lib/auth/password';
import type { AuthPayload } from '@/lib/auth/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const email = normalize(formData.get('email'));
    const password = formData.get('password');

    if (!email || typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
    }

    // Verify password against User.passwordHash
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
    }

    // Find org association via worker (User.id === Worker.id by design)
    const workerRel = await prisma.workerOrgRelationship.findFirst({
      where: { workerId: user.id },
      select: { orgId: true },
    });
    if (!workerRel) {
      return NextResponse.json({ error: 'ORG_NOT_FOUND' }, { status: 401 });
    }

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30d

    await prisma.session.create({
      data: {
        userId: user.id,
        orgId: workerRel.orgId,
        refreshTokenHash,
        expiresAt,
        lastSeenAt: now,
      },
    });

    const payload: AuthPayload = { userId: user.id, orgId: workerRel.orgId, role: 'user' };
    const accessToken = signAccessToken(payload);

    const res = NextResponse.redirect(new URL('/dashboard', req.url));
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);
    return res;
  } catch (err) {
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
}

function normalize(input: FormDataEntryValue | null): string {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase();
}

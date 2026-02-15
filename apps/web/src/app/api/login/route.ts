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
    const password = normalize(formData.get('password'));

    if (!email || !password) {
      return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
    }

    const worker = await prisma.worker.findUnique({
      where: { email },
      include: { workerOrgRelationships: { select: { orgId: true }, take: 1 } },
    });
    if (!worker) return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });

    const passwordHash = worker.ssnEncrypted;
    if (!passwordHash || !(await verifyPassword(password, passwordHash))) {
      return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
    }

    const orgRel = worker.workerOrgRelationships.at(0);
    if (!orgRel) return NextResponse.json({ error: 'ORG_NOT_FOUND' }, { status: 401 });

    const user = await prisma.user.upsert({
      where: { email },
      update: { name: worker.name ?? null },
      create: { id: worker.id, email, name: worker.name ?? null },
    });

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30d

    await prisma.session.create({
      data: {
        userId: user.id,
        orgId: orgRel.orgId,
        refreshTokenHash,
        expiresAt,
        lastSeenAt: now,
      },
    });

    const payload: AuthPayload = { userId: user.id, orgId: orgRel.orgId, role: 'user' };
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


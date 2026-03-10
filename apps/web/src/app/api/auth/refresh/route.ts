import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { prisma } from '@magnus/db/client';
import { consumeRefreshAttempt } from '@magnus/security';
import { signAccessToken } from '@/lib/auth/tokens';
import { generateRefreshToken, hashRefreshToken } from '@/lib/auth/refresh';
import { setAccessCookie, setRefreshCookie, clearAuthCookies } from '@/lib/auth/cookies';
import type { AuthPayload } from '@/lib/auth/types';

export const runtime = 'nodejs';

export async function POST() {
  // ── Rate-limit gate: 10 refresh attempts per minute per IP ───────────────────
  const ip = extractIp();
  const rl = await consumeRefreshAttempt(ip);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const refreshToken = cookies().get('refresh')?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const refreshTokenHash = hashRefreshToken(refreshToken);

  const session = await prisma.session.findUnique({
    where: { refreshTokenHash },
    select: {
      id: true,
      userId: true,
      orgId: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { id: true } },
    },
  });

  // Fail closed: reject if session not found, revoked, or expired
  if (!session) {
    const res = NextResponse.json({ error: 'AUTH_INVALID' }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  if (session.revokedAt !== null) {
    const res = NextResponse.json({ error: 'AUTH_REVOKED' }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  if (session.expiresAt < new Date()) {
    const res = NextResponse.json({ error: 'AUTH_EXPIRED' }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  // Rotate refresh token: revoke old, create new
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30d

  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: now },
    }),
    prisma.session.create({
      data: {
        userId: session.userId,
        orgId: session.orgId,
        refreshTokenHash: newRefreshTokenHash,
        expiresAt,
        lastSeenAt: now,
      },
    }),
  ]);

  const payload: AuthPayload = { userId: session.userId, orgId: session.orgId, role: 'user' };
  const accessToken = signAccessToken(payload);

  const res = NextResponse.json({ ok: true });
  setAccessCookie(res, accessToken);
  setRefreshCookie(res, newRefreshToken);
  return res;
}

/**
 * Extract client IP from request headers.
 * Prefers x-forwarded-for (set by reverse proxies / Vercel).
 * Falls back to '127.0.0.1' in development.
 */
function extractIp(): string {
  const forwarded = headers().get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return '127.0.0.1';
}

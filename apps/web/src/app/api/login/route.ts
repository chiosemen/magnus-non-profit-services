import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@magnus/db/client';
import { isLoginBlocked, recordLoginFailure, clearLoginFailures } from '@magnus/security';
import { signAccessToken } from '@/lib/auth/tokens';
import { generateRefreshToken, hashRefreshToken } from '@/lib/auth/refresh';
import { setAccessCookie, setRefreshCookie } from '@/lib/auth/cookies';
import { verifyPassword } from '@/lib/auth/password';
import type { AuthPayload } from '@/lib/auth/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // ── Rate-limit gate: block IPs that have exhausted their failure budget ─────
  const ip = extractIp();
  const preCheck = await isLoginBlocked(ip);
  if (preCheck.limited) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: preCheck.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(preCheck.retryAfterSec) } },
    );
  }

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
      const limited = await penalizeLogin(ip);
      if (limited) return limited;
      return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
    }

    // Verify password against User.passwordHash
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      const limited = await penalizeLogin(ip);
      if (limited) return limited;
      return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
    }

    // Find org association via worker (User.id === Worker.id by design)
    const workerRel = await prisma.workerOrgRelationship.findFirst({
      where: { workerId: user.id },
      select: { orgId: true },
    });
    if (!workerRel) {
      const limited = await penalizeLogin(ip);
      if (limited) return limited;
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

    // Login succeeded — clear failure record for this IP
    await clearLoginFailures(ip);

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

/**
 * Penalize an IP for a failed login attempt.
 * Returns a 429 Response if this failure exhausted the remaining budget, null otherwise.
 */
async function penalizeLogin(ip: string): Promise<NextResponse | null> {
  const result = await recordLoginFailure(ip);
  if (!result.limited) return null;
  return NextResponse.json(
    { error: 'RATE_LIMITED', retryAfterSec: result.retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } },
  );
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

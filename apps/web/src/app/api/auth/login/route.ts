import { NextResponse } from 'next/server';
import { prisma } from '@magnus/db/client';
import { headers } from 'next/headers';
import { signAccessToken } from '@/lib/auth/tokens';
import { generateRefreshToken, hashRefreshToken } from '@/lib/auth/refresh';
import { setAccessCookie, setRefreshCookie } from '@/lib/auth/cookies';
import type { AuthPayload } from '@/lib/auth/types';
import { checkRateLimit, recordFailure, clearFailures } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // ── Rate-limit gate (in-memory, temporary until Redis) ────────────
  const ip = extractIp();
  const rateCheck = checkRateLimit(ip);
  if (rateCheck.limited) {
    const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
    return Response.json(
      { error: 'RATE_LIMITED', retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

  const body = await safeJson(req);
  const ein = typeof body?.ein === 'string' ? body.ein.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!ein || !email || !password) {
    return Response.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({ where: { ein } });
  if (!org) {
    recordFailure(ip);
    return Response.json({ error: 'ORG_NOT_FOUND' }, { status: 401 });
  }

  const worker = await prisma.worker.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true },
  });
  if (!worker) {
    recordFailure(ip);
    return Response.json({ error: 'WORKER_NOT_FOUND' }, { status: 401 });
  }

  // Fail closed: reject login if no password hash is stored
  if (!worker.passwordHash) {
    recordFailure(ip);
    return Response.json({ error: 'CREDENTIALS_INVALID' }, { status: 401 });
  }

  // Compare raw password bytes — no trim/toLowerCase on password
  const valid = await bcrypt.compare(password, worker.passwordHash);
  if (!valid) {
    recordFailure(ip);
    return Response.json({ error: 'CREDENTIALS_INVALID' }, { status: 401 });
  }

  const rel = await prisma.workerOrgRelationship.findFirst({
    where: { orgId: org.id, workerId: worker.id },
    select: { id: true },
  });
  if (!rel) {
    recordFailure(ip);
    return Response.json({ error: 'NOT_ASSOCIATED' }, { status: 401 });
  }

  // Login succeeded — clear rate-limit record for this IP
  clearFailures(ip);

  // Upsert User record for unified auth model
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: worker.name ?? null },
    create: { id: worker.id, email, name: worker.name ?? null },
  });

  // Create session with refresh token
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
}

async function safeJson(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/**
 * Extract client IP from request headers.
 * Prefers x-forwarded-for (set by reverse proxies / Vercel).
 * Falls back to '127.0.0.1' in development.
 */
function extractIp(): string {
  const forwarded = headers().get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be comma-separated; first entry is the client
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return '127.0.0.1';
}

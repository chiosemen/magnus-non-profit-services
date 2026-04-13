import { prisma } from '@magnus/db/client';
import { cookies, headers } from 'next/headers';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME, signAppToken } from '@/lib/auth';
import { createSession } from '@/lib/session';
import { checkRateLimit, recordFailure, clearFailures } from '@/lib/rate-limit';
import { validateCsrfOrigin, csrfRejectionResponse } from '@/lib/csrf';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // ── CSRF origin enforcement ────────────────────────────────────────
  if (!validateCsrfOrigin(req)) return csrfRejectionResponse();

  // ── Rate-limit gate (Redis-backed when REDIS_URL set) ──────────────
  const ip = extractIp();
  const rateCheck = await checkRateLimit(ip);
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
  if (!ein || !email || !password) return Response.json({ error: 'INVALID_INPUT' }, { status: 400 });

  const org = await prisma.organization.findUnique({ where: { ein } });
  if (!org) {
    await recordFailure(ip);
    return Response.json({ error: 'ORG_NOT_FOUND' }, { status: 401 });
  }

  const worker = await prisma.worker.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  if (!worker) {
    await recordFailure(ip);
    return Response.json({ error: 'WORKER_NOT_FOUND' }, { status: 401 });
  }

  // Fail closed: reject login if no password hash is stored
  if (!worker.passwordHash) {
    await recordFailure(ip);
    return Response.json({ error: 'CREDENTIALS_INVALID' }, { status: 401 });
  }

  // Compare raw password bytes — no trim/toLowerCase on password
  const valid = await bcrypt.compare(password, worker.passwordHash);
  if (!valid) {
    await recordFailure(ip);
    return Response.json({ error: 'CREDENTIALS_INVALID' }, { status: 401 });
  }

  const rel = await prisma.workerOrgRelationship.findFirst({
    where: { orgId: org.id, workerId: worker.id },
    select: { id: true },
  });
  if (!rel) {
    await recordFailure(ip);
    return Response.json({ error: 'NOT_ASSOCIATED' }, { status: 401 });
  }

  // Login succeeded — clear rate-limit record for this IP
  await clearFailures(ip);

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

/**
 * Extract client IP from request headers.
 * Prefers x-forwarded-for (set by reverse proxies / Vercel / Railway).
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

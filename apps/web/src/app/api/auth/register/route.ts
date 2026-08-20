import { prisma } from '@magnus/db/client';
import { cookies, headers } from 'next/headers';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME, signAppToken } from '@/lib/auth';
import { createSession } from '@/lib/session';
import { validateCsrfOrigin, csrfRejectionResponse } from '@/lib/csrf';
import {
  checkRateLimit,
  recordFailure,
  isRateLimitBackendUnavailableError,
} from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Self-registration mints the LEAST-PRIVILEGED role, never 'admin'.
 *
 * P0-7: this route previously signed `role: 'admin'` unconditionally. Combined
 * with the org upsert below, an unauthenticated caller could obtain an admin
 * session on someone else's organization. The org takeover is closed by
 * create-only semantics; this constant closes the privilege half.
 *
 * NOTE: `login` and `refresh` still hardcode `role: 'admin'`. Until those are
 * changed too, a self-registered account can still reach admin by logging in.
 * There is no role column in the schema — WorkerOrgRelationship carries only
 * relationshipType — so a durable fix needs a role source, tracked separately.
 */
const SELF_REGISTRATION_ROLE = 'member';

/**
 * Identical response for every conflict, so the endpoint cannot be used to
 * distinguish "this email is registered" from "this EIN is registered".
 * A caller learns only that registration did not proceed.
 */
function registrationConflictResponse(): Response {
  return Response.json({ error: 'REGISTRATION_CONFLICT' }, { status: 409 });
}

function rateLimitBackendUnavailableResponse(): Response {
  return Response.json({ error: 'RATE_LIMIT_BACKEND_UNAVAILABLE' }, { status: 503 });
}

export async function POST(req: Request) {
  // ── CSRF origin enforcement ────────────────────────────────────────
  if (!validateCsrfOrigin(req)) return csrfRejectionResponse();

  // ── Rate-limit gate ────────────────────────────────────────────────
  // P0-7: registration was previously unthrottled, so the account-takeover
  // and org-enumeration attempts below could be iterated without limit.
  const ip = extractIp();
  let rateCheck: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    rateCheck = await checkRateLimit(ip);
  } catch (err) {
    if (isRateLimitBackendUnavailableError(err)) return rateLimitBackendUnavailableResponse();
    throw err;
  }
  if (rateCheck.limited) {
    const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
    return Response.json(
      { error: 'RATE_LIMITED', retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }

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

  // ── Create-only registration ───────────────────────────────────────
  // P0-7: both records were previously created with `upsert`, which made this
  // public endpoint a write primitive against existing rows:
  //   - worker.upsert on `email` OVERWROTE an existing account's passwordHash
  //     (account takeover: register as a known email, then log in as them);
  //   - organization.upsert on `ein` returned the EXISTING org, renamed it,
  //     bound the caller to it, and issued a session scoped to it — keyed on
  //     an EIN, which is public data published by the IRS.
  // Registration now creates new records only. Any collision is refused, and
  // no existing row is read into the caller's session or mutated.
  let created: { orgId: string; workerId: string } | null = null;
  try {
    created = await prisma.$transaction(async (tx: any) => {
      const existingOrg = await tx.organization.findUnique({ where: { ein }, select: { id: true } });
      if (existingOrg) return null;

      const existingWorker = await tx.worker.findUnique({ where: { email }, select: { id: true } });
      if (existingWorker) return null;

      const org = await tx.organization.create({
        data: {
          ein,
          name: orgName,
          subscriptionTier: 'STARTER',
          // subscriptionStatus intentionally omitted — the column default is
          // PENDING, so a self-registered org carries no entitlement until an
          // operator activates it. isFeatureEnabled() checks status before
          // tier and fails closed for anything that is not ACTIVE.
        },
        select: { id: true },
      });

      const worker = await tx.worker.create({
        data: { email, passwordHash, ...(name ? { name } : {}) },
        select: { id: true },
      });

      await tx.workerOrgRelationship.create({
        data: {
          workerId: worker.id,
          orgId: org.id,
          relationshipType: 'CONTRACTOR_1099',
          startDate: new Date(),
          grantFunded: false,
        },
      });

      return { orgId: org.id, workerId: worker.id };
    });
  } catch (err) {
    // A unique-constraint violation means a concurrent request won the race.
    // Treat it exactly like the checked collision above — same response, so
    // the timing/branch difference is not observable.
    if (isUniqueConstraintViolation(err)) {
      await recordFailure(ip).catch(() => {});
      return registrationConflictResponse();
    }
    throw err;
  }

  if (!created) {
    // Count refused registrations toward the rate limit so collision probing
    // is throttled like failed logins.
    await recordFailure(ip).catch(() => {});
    return registrationConflictResponse();
  }

  // Create server-side session row bound to the newly created org
  const { sessionId, refreshToken } = await createSession(created.workerId, created.orgId);

  const token = signAppToken({
    orgId: created.orgId,
    workerId: created.workerId,
    role: SELF_REGISTRATION_ROLE,
    sub: created.workerId,
    sessionId,
  });
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

function isUniqueConstraintViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'P2002';
}

/**
 * Client IP for rate limiting.
 * Prefers x-forwarded-for (set by reverse proxies / Vercel / Railway).
 */
function extractIp(): string {
  const forwarded = headers().get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be comma-separated; first entry is the client
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers().get('x-real-ip')?.trim() || 'unknown';
}

async function safeJson(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

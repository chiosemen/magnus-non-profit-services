import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * Result type returned by all rate-limit helpers.
 * Uses only primitives so callers never need to import rate-limiter-flexible
 * types directly — avoiding cross-package TypeScript resolution issues.
 */
export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSec: number };

// ── Limiter instances (module-private) ────────────────────────────────────────

/**
 * Login failure limiter — 5 failed attempts per 60 seconds per IP.
 * Points are consumed on FAILED credential checks only; successful logins
 * delete the IP's record so shared-IP offices are never locked out.
 */
const loginLimiter = new RateLimiterMemory({ points: 5, duration: 60 });

/**
 * Refresh-token limiter — 10 attempts per 60 seconds per IP.
 * Every refresh request is counted because a legitimate client should only
 * refresh once per access-token TTL (15 min).
 */
const refreshLimiter = new RateLimiterMemory({ points: 10, duration: 60 });

// ── Public helpers ─────────────────────────────────────────────────────────────

/**
 * Check whether an IP is currently blocked without consuming a point.
 * Call at the top of the login handler before any DB work.
 */
export async function isLoginBlocked(ip: string): Promise<RateLimitResult> {
  const info = await loginLimiter.get(ip);
  if (info !== null && info.remainingPoints <= 0) {
    return { limited: true, retryAfterSec: Math.ceil(info.msBeforeNext / 1000) };
  }
  return { limited: false };
}

/**
 * Penalize a failed login attempt for an IP.
 * Returns `{ limited: true }` if this failure exhausted the budget (concurrent
 * edge case) so the caller can return a 429 immediately.
 */
export async function recordLoginFailure(ip: string): Promise<RateLimitResult> {
  try {
    await loginLimiter.consume(ip);
    return { limited: false };
  } catch (rlRes: any) {
    const ms: number = typeof rlRes?.msBeforeNext === 'number' ? rlRes.msBeforeNext : 60000;
    return { limited: true, retryAfterSec: Math.ceil(ms / 1000) };
  }
}

/**
 * Clear the failure record for an IP on successful login.
 */
export async function clearLoginFailures(ip: string): Promise<void> {
  await loginLimiter.delete(ip);
}

/**
 * Consume one refresh-token attempt for an IP.
 * Returns `{ limited: true }` once the 10-per-minute budget is exceeded.
 */
export async function consumeRefreshAttempt(ip: string): Promise<RateLimitResult> {
  try {
    await refreshLimiter.consume(ip);
    return { limited: false };
  } catch (rlRes: any) {
    const ms: number = typeof rlRes?.msBeforeNext === 'number' ? rlRes.msBeforeNext : 60000;
    return { limited: true, retryAfterSec: Math.ceil(ms / 1000) };
  }
}

/**
 * Magnus Web — Redis-Backed IP Rate Limiter (multi-instance safe)
 *
 * Architecture:
 *   - When REDIS_URL is set: uses RateLimiterRedis (rate-limiter-flexible + ioredis)
 *     → State is shared across all instances, pods, and Railway containers.
 *     → Attack distribute-across-instances bypass is closed.
 *   - When REDIS_URL is absent outside production: falls back to RateLimiterMemory
 *     → Single-process only. Acceptable for local dev/test; NOT production-safe.
 *   - In production: REDIS_URL is mandatory, and Redis connection failures throw.
 *
 * Design:
 *   The `rate-limiter-flexible` library provides both RateLimiterRedis and
 *   RateLimiterMemory behind a common interface. The login route uses
 *   consume/get/delete from this unified interface.
 *
 *   Strategy: fixed window (duration = WINDOW_SECS) with MAX_FAILURES points.
 *   Each failed login attempt consumes 1 point. After MAX_FAILURES failures
 *   in the window, the IP is blocked until the window resets.
 *   On successful login, the IP's record is deleted via clearFailures().
 *
 * Environment:
 *   REDIS_URL — e.g. redis://default:password@redis.railway.internal:6379
 *   Required in production (Railway Redis, Upstash, etc.)
 *
 * Exported interface (async, compatible with Redis I/O):
 *   checkRateLimit(ip) → Promise<{ limited: true, retryAfterMs } | { limited: false }>
 *   recordFailure(ip)  → Promise<void>
 *   clearFailures(ip)  → Promise<void>
 */

/* eslint-disable @typescript-eslint/no-require-imports */

export const RATE_LIMIT_WINDOW_SECS = 15 * 60;   // 15 minutes
export const RATE_LIMIT_MAX_FAILURES = 5;

// ─── Minimal duck-typed interface matching rate-limiter-flexible ──────────────

interface RLFRes {
  consumedPoints: number;
  remainingPoints: number;
  msBeforeNext: number;
  isFirstInDuration: boolean;
}

interface RateLimiterLike {
  get(key: string): Promise<RLFRes | null>;
  consume(key: string, pointsToConsume?: number): Promise<RLFRes>;
  delete(key: string): Promise<boolean>;
}

export class RateLimitBackendUnavailableError extends Error {
  readonly code = 'RATE_LIMIT_BACKEND_UNAVAILABLE';

  constructor(message = 'Rate limit backend is unavailable') {
    super(message);
    this.name = 'RateLimitBackendUnavailableError';
  }
}

export function isRateLimitBackendUnavailableError(err: unknown): err is RateLimitBackendUnavailableError {
  return err instanceof RateLimitBackendUnavailableError
    || (Boolean(err) && typeof err === 'object' && (err as { code?: unknown }).code === 'RATE_LIMIT_BACKEND_UNAVAILABLE');
}

// ─── Lazy singleton ───────────────────────────────────────────────────────────

let _limiter: RateLimiterLike | null = null;

async function buildMemoryLimiter(): Promise<RateLimiterLike> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RateLimiterMemory } = require('rate-limiter-flexible') as any;
  return new RateLimiterMemory({
    points: RATE_LIMIT_MAX_FAILURES,
    duration: RATE_LIMIT_WINDOW_SECS,
    keyPrefix: 'magnus_login_rl',
  }) as unknown as RateLimiterLike;
}

/**
 * Returns the shared rate limiter instance (Redis-backed if REDIS_URL set,
 * in-memory otherwise). Initialised lazily on first call.
 */
async function getLimiter(): Promise<RateLimiterLike> {
  if (_limiter) return _limiter;

  const redisUrl = process.env['REDIS_URL']?.trim();
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (redisUrl) {
    // ── Redis path (multi-instance safe) ─────────────────────────────────────
      try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RateLimiterRedis } = require('rate-limiter-flexible') as Record<string, new (...a: unknown[]) => RateLimiterLike>;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const RedisLib = require('ioredis') as { default?: new (...a: unknown[]) => unknown; new(...a: unknown[]): unknown };
      const Redis = (RedisLib.default ?? RedisLib) as new (url: string, opts: Record<string, unknown>) => { connect(): Promise<void> };

      const redis = new Redis(redisUrl, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 2,
        connectTimeout: 2000,
        lazyConnect: true,
      });

      // Test connection once. Production must not boot or serve auth without Redis.
      await redis.connect();

      _limiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: 'magnus_login_rl',
        points: RATE_LIMIT_MAX_FAILURES,
        duration: RATE_LIMIT_WINDOW_SECS,
      }) as unknown as RateLimiterLike;

      console.info('[magnus:rate-limit] Redis-backed rate limiter active (multi-instance safe).');

    } catch (err) {
      if (isProduction) {
        throw new RateLimitBackendUnavailableError('Redis rate limit backend failed to connect');
      }
      console.error(
        '[magnus:rate-limit] Redis connection failed — falling back to in-memory limiter. ' +
        'Login throttling will NOT be multi-instance safe until Redis is restored. This fallback is disabled in production.\n',
        err
      );
      _limiter = await buildMemoryLimiter();
    }

  } else {
    // ── In-memory fallback (dev / single-instance) ────────────────────────────
    if (isProduction) {
      throw new RateLimitBackendUnavailableError('REDIS_URL is required for production rate limiting');
    }
    console.warn(
      '[magnus:rate-limit] REDIS_URL is not set. Using in-memory rate limiter for local dev/test only. ' +
      'Production deployments must set REDIS_URL.'
    );
    _limiter = await buildMemoryLimiter();
  }

  return _limiter;
}

// ─── Public interface ─────────────────────────────────────────────────────────

/**
 * Check whether an IP is currently rate-limited WITHOUT consuming a point.
 * Call this before processing the request body.
 */
export async function checkRateLimit(
  ip: string
): Promise<{ limited: true; retryAfterMs: number } | { limited: false }> {
  try {
    const limiter = await getLimiter();
    const res = await limiter.get(ip);
    if (!res) return { limited: false };

    if (res.remainingPoints <= 0) {
      return { limited: true, retryAfterMs: Math.max(Math.ceil(res.msBeforeNext), 1000) };
    }
    return { limited: false };
  } catch (err) {
    if (process.env['NODE_ENV'] === 'production') {
      if (isRateLimitBackendUnavailableError(err)) throw err;
      throw new RateLimitBackendUnavailableError();
    }
    return { limited: false };
  }
}

/**
 * Record a failed login attempt for an IP (consumes one rate-limit point).
 * Call after any 401/403 response on the login route.
 */
export async function recordFailure(ip: string): Promise<void> {
  try {
    const limiter = await getLimiter();
    await limiter.consume(ip, 1);
  } catch (err: unknown) {
    // RateLimiterRes is thrown by consume() when the limit is already exceeded — expected.
    if (err && typeof err === 'object' && 'msBeforeNext' in err) return;
    if (process.env['NODE_ENV'] === 'production') {
      if (isRateLimitBackendUnavailableError(err)) throw err;
      throw new RateLimitBackendUnavailableError();
    }
    console.error('[magnus:rate-limit] recordFailure error:', err);
  }
}

/**
 * Clear all failure records for an IP (call on successful login).
 */
export async function clearFailures(ip: string): Promise<void> {
  try {
    const limiter = await getLimiter();
    await limiter.delete(ip);
  } catch (err) {
    if (process.env['NODE_ENV'] === 'production') {
      if (isRateLimitBackendUnavailableError(err)) throw err;
      throw new RateLimitBackendUnavailableError();
    }
    console.error('[magnus:rate-limit] clearFailures error:', err);
  }
}

/**
 * Exposed for testing only — resets the singleton so a fresh limiter is created.
 * Do NOT call in production code.
 */
export function _resetLimiterForTest(): void {
  _limiter = null;
}

/**
 * Exposed for testing only — inject a pre-built limiter instance.
 * Do NOT call in production code.
 */
export function _injectLimiterForTest(limiter: RateLimiterLike): void {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('_injectLimiterForTest is disabled in production');
  }
  _limiter = limiter;
}

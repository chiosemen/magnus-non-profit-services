/**
 * Magnus Web — IP-based Sliding-Window Rate Limiter
 *
 * ⚠️  SINGLE-PROCESS ONLY WARNING:
 *   This implementation stores failure state in a Node.js process-local Map.
 *   In a multi-instance deployment (horizontal scaling, serverless cold starts,
 *   multiple Railway containers), each process has its own isolated state.
 *   An attacker can bypass this limit by distributing requests across instances.
 *
 * PRODUCTION UPGRADE PATH (Wave 4):
 *   Replace with Redis-backed rate limiting using `ioredis` + the
 *   `rate-limiter-flexible` package (already in mcp-connector dependencies).
 *   The exported interface is designed to be drop-in replaceable:
 *
 *   ```typescript
 *   // Redis adapter (to be implemented):
 *   import { RateLimiterRedis } from 'rate-limiter-flexible';
 *   // checkRateLimit → limiter.consume(ip)
 *   // recordFailure → no-op (limiter.consume tracks internally)
 *   // clearFailures → limiter.delete(ip)
 *   ```
 *
 * Sliding window logic:
 *   - Each IP stores an array of failure timestamps.
 *   - On each check, timestamps older than the window are pruned.
 *   - If the remaining count >= limit, the request is blocked (429).
 *   - On successful login, the IP's record is cleared.
 *
 * GC:
 *   - A periodic sweep (every 5 min) removes IPs whose newest timestamp
 *     is older than the window, preventing unbounded memory growth.
 */

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_FAILURES = 5;
const GC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Map<IP, sorted array of failure timestamps (epoch ms)> */
const failures = new Map<string, number[]>();

/**
 * Check whether an IP is currently rate-limited.
 * Returns `{ limited: true, retryAfterMs }` if the IP has exceeded the limit,
 * or `{ limited: false }` if the request may proceed.
 *
 * ⚠️ Single-process only — see module-level warning.
 */
export function checkRateLimit(ip: string): { limited: true; retryAfterMs: number } | { limited: false } {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    const timestamps = failures.get(ip);
    if (!timestamps || timestamps.length === 0) {
        return { limited: false };
    }

    // Prune entries older than the window
    const recent = timestamps.filter((t) => t > windowStart);
    if (recent.length === 0) {
        failures.delete(ip);
        return { limited: false };
    }
    failures.set(ip, recent);

    if (recent.length >= RATE_LIMIT_MAX_FAILURES) {
        // Earliest failure in window determines when the window slides open
        const retryAfterMs = recent[0]! + RATE_LIMIT_WINDOW_MS - now;
        return { limited: true, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    return { limited: false };
}

/**
 * Record a failed login attempt for an IP.
 * ⚠️ Single-process only — see module-level warning.
 */
export function recordFailure(ip: string): void {
    const now = Date.now();
    const timestamps = failures.get(ip) ?? [];
    timestamps.push(now);
    failures.set(ip, timestamps);
}

/**
 * Clear all failure records for an IP (call on successful login).
 * ⚠️ Single-process only — see module-level warning.
 */
export function clearFailures(ip: string): void {
    failures.delete(ip);
}

/**
 * Exposed for testing: returns current in-memory state size.
 * Do not use in production business logic.
 */
export function _getFailureMapSize(): number {
    return failures.size;
}

// ── Periodic garbage collection ──────────────────────────────────────────
// Prevents unbounded memory growth from abandoned IPs.
// Uses unref() so the timer does not prevent Node.js from exiting.
const gcTimer = setInterval(() => {
    const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [ip, timestamps] of failures) {
        const newest = timestamps[timestamps.length - 1];
        if (newest === undefined || newest <= windowStart) {
            failures.delete(ip);
        }
    }
}, GC_INTERVAL_MS);

if (typeof gcTimer === 'object' && 'unref' in gcTimer) {
    gcTimer.unref();
}

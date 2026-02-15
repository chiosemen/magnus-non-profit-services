/**
 * In-memory IP-based sliding-window rate limiter.
 *
 * Temporary until Redis layer exists.
 * NOT suitable for multi-instance deployments (each process keeps its own map).
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

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 5;
const GC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Map<IP, sorted array of failure timestamps (epoch ms)> */
const failures = new Map<string, number[]>();

/**
 * Check whether an IP is currently rate-limited.
 * Returns `{ limited: true, retryAfterMs }` if the IP has exceeded the limit,
 * or `{ limited: false }` if the request may proceed.
 */
export function checkRateLimit(ip: string): { limited: true; retryAfterMs: number } | { limited: false } {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

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

    if (recent.length >= MAX_FAILURES) {
        // Earliest failure in window determines when the window slides open
        const retryAfterMs = recent[0]! + WINDOW_MS - now;
        return { limited: true, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    return { limited: false };
}

/**
 * Record a failed login attempt for an IP.
 */
export function recordFailure(ip: string): void {
    const now = Date.now();
    const timestamps = failures.get(ip) ?? [];
    timestamps.push(now);
    failures.set(ip, timestamps);
}

/**
 * Clear all failure records for an IP (call on successful login).
 */
export function clearFailures(ip: string): void {
    failures.delete(ip);
}

// ── Periodic garbage collection ──────────────────────────────────────────
// Prevents unbounded memory growth from abandoned IPs.
// Uses unref() so the timer does not prevent Node.js from exiting.
const gcTimer = setInterval(() => {
    const windowStart = Date.now() - WINDOW_MS;
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

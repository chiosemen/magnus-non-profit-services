import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME, signAppToken, verifyAppToken } from '@/lib/auth';
import { rotateSession } from '@/lib/session';
import { validateCsrfOrigin, csrfRejectionResponse } from '@/lib/csrf';

export const runtime = 'nodejs';

/**
 * POST /api/auth/refresh
 *
 * Fail-closed refresh token rotation:
 *   1. Validate CSRF origin (must have X-Magnus-CSRF: 1 + matching origin)
 *   2. Read refresh cookie (raw token) + access cookie (for sessionId)
 *   3. Decode access JWT (allow expired — we're refreshing)
 *   4. Call rotateSession(sessionId, rawToken)
 *      - validates hash match, not revoked, not expired
 *      - on hash mismatch → revokes session (token reuse attack)
 *      - replaces hash in DB, updates lastSeenAt
 *   5. Issue new access JWT + new refresh cookie
 *   6. Old refresh token is immediately invalid
 */
export async function POST(req: Request) {
    // ── CSRF origin enforcement ────────────────────────────────────────
    if (!validateCsrfOrigin(req)) return csrfRejectionResponse();

    // ── 1. Read cookies ──────────────────────────────────────────────
    const refreshToken = cookies().get(REFRESH_COOKIE_NAME)?.value;
    const accessToken = cookies().get(AUTH_COOKIE_NAME)?.value;

    if (!refreshToken || !accessToken) {
        return Response.json({ error: 'REFRESH_REQUIRED' }, { status: 401 });
    }

    // ── 2. Decode access JWT to extract sessionId ────────────────────
    // Use verifyAppToken which will throw if fully invalid.
    // For refresh flow, we accept the JWT even if expired (the refresh token is the auth).
    let sessionId: string | undefined;
    try {
        const payload = verifyAppToken(accessToken);
        sessionId = payload.sessionId;
    } catch {
        // JWT expired or invalid — try to extract sessionId from raw decode
        try {
            const jwt = await import('jsonwebtoken');
            const decoded = jwt.default.decode(accessToken);
            if (decoded && typeof decoded === 'object' && typeof decoded.sessionId === 'string') {
                sessionId = decoded.sessionId;
            }
        } catch {
            // Fully undecodable
        }
    }

    if (!sessionId) {
        return Response.json({ error: 'SESSION_MISSING' }, { status: 401 });
    }

    // ── 3. Rotate session ────────────────────────────────────────────
    const result = await rotateSession(sessionId, refreshToken);
    if (!result) {
        // Rotation failed — token reuse, revoked, or expired
        // Clear both cookies to force re-login
        clearCookies();
        return Response.json({ error: 'REFRESH_INVALID' }, { status: 401 });
    }

    // ── 4. Issue new tokens ──────────────────────────────────────────
    const newAccessToken = signAppToken({
        orgId: result.orgId,
        workerId: result.workerId,
        role: 'admin',
        sub: result.workerId,
        sessionId,
    });

    cookies().set({
        name: AUTH_COOKIE_NAME,
        value: newAccessToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env['NODE_ENV'] === 'production',
        path: '/',
        maxAge: 900, // 15 minutes — aligned with JWT exp
    });

    cookies().set({
        name: REFRESH_COOKIE_NAME,
        value: result.newRefreshToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env['NODE_ENV'] === 'production',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return Response.json({ ok: true });
}

function clearCookies() {
    const secure = process.env['NODE_ENV'] === 'production';
    cookies().set({ name: AUTH_COOKIE_NAME, value: '', httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
    cookies().set({ name: REFRESH_COOKIE_NAME, value: '', httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
}

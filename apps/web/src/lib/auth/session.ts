/**
 * Server-only session validation facade.
 *
 * Provides the four spec-required functions using existing auth primitives.
 * All DB access goes through @magnus/db — no direct Prisma imports here.
 *
 * Functions:
 *  - getAuthFromRequestCookies()    → read cookie + verify JWT (no throw)
 *  - requireValidSession(userId, orgId) → active session lookup + orgId cross-check
 *  - requireMembership(userId, orgId)   → org membership check
 *  - requireAuthOrRedirect(nextPath)    → SSR guard: JWT → session → membership → redirect
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
    AUTH_COOKIE_NAME,
    verifyAppToken,
    type AppJwtPayload,
} from '@/lib/auth';
import {
    verifySession,
    validateMembership,
} from '@/lib/session';

// ─── 1. getAuthFromRequestCookies ────────────────────────────────────────────
/**
 * Read the access cookie and verify the JWT.
 * Returns claims on success, null on any failure (no throw).
 */
export function getAuthFromRequestCookies(): {
    userId: string;
    orgId: string;
    role: string;
    sessionId: string;
} | null {
    const token = cookies().get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    try {
        const payload = verifyAppToken(token);
        return {
            userId: payload.workerId,
            orgId: payload.orgId,
            role: payload.role,
            sessionId: payload.sessionId,
        };
    } catch {
        return null;
    }
}

// ─── 2. requireValidSession ──────────────────────────────────────────────────
/**
 * Query Session table for an ACTIVE session matching the given user+org.
 * Also cross-checks that session.orgId matches the caller-supplied orgId
 * (tamper detection).
 *
 * Returns the session row on success, null on any failure.
 */
export async function requireValidSession(
    sessionId: string,
    orgId: string,
): Promise<{ id: string; workerId: string; orgId: string } | null> {
    const session = await verifySession(sessionId);
    if (!session) return null;

    // INV-3: orgId cross-check — detect tampered / stale JWT
    if (session.orgId !== orgId) return null;

    return session;
}

// ─── 3. requireMembership ────────────────────────────────────────────────────
/**
 * Verify that the worker still belongs to the given organization.
 * Delegates to the canonical validateMembership function.
 */
export async function requireMembership(
    userId: string,
    orgId: string,
): Promise<boolean> {
    return validateMembership(userId, orgId);
}

// ─── 4. requireAuthOrRedirect ────────────────────────────────────────────────
/**
 * SSR guard: enforces all four session-binding invariants.
 *
 *   1. JWT signature + expiry
 *   2. Session exists, not revoked, not expired
 *   3. jwt.orgId === session.orgId
 *   4. Worker still belongs to org
 *
 * On ANY failure → redirect('/login?next=<nextPath>') (fail-closed).
 * Returns verified claims on success.
 */
export async function requireAuthOrRedirect(
    nextPath: string,
): Promise<AppJwtPayload> {
    const loginUrl = `/login?next=${encodeURIComponent(nextPath)}`;

    // INV-1: JWT signature + expiry
    const token = cookies().get(AUTH_COOKIE_NAME)?.value;
    if (!token) redirect(loginUrl);

    let payload: AppJwtPayload;
    try {
        payload = verifyAppToken(token);
    } catch {
        redirect(loginUrl);
    }

    // INV-2: session exists + not revoked + not expired
    const session = await verifySession(payload.sessionId);
    if (!session) redirect(loginUrl);

    // INV-3: orgId cross-check (detect tampered JWT)
    if (payload.orgId !== session.orgId) redirect(loginUrl);

    // INV-4: membership still active
    const isMember = await validateMembership(payload.workerId, payload.orgId);
    if (!isMember) redirect(loginUrl);

    return payload;
}

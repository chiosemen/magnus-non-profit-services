import { prisma } from '@magnus/db/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Create a new session row for a worker, bound to a specific org.
 * Returns the sessionId (stored in JWT) and the raw refreshToken (set as cookie).
 *
 * orgId MUST be validated before calling — this function does not re-check membership.
 */
export async function createSession(workerId: string, orgId: string): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const session = await prisma.session.create({
        data: {
            userId: workerId,
            orgId,
            refreshTokenHash,
            expiresAt,
        },
        select: { id: true },
    });

    return { sessionId: session.id, refreshToken };
}

/**
 * Verify that a session exists, is not revoked, and has not expired.
 * Returns the session row if valid, or null if invalid.
 */
export async function verifySession(sessionId: string): Promise<{ id: string; workerId: string; orgId: string } | null> {
    if (!sessionId) return null;

    const now = new Date();
    const session = await prisma.session.findFirst({
        where: {
            id: sessionId,
            revokedAt: null,
            expiresAt: { gt: now },
        },
        select: { id: true, userId: true, orgId: true },
    });

    if (!session) return null;

    return { id: session.id, workerId: session.userId, orgId: session.orgId };
}

/**
 * Rotate refresh token on a session.
 *
 * Fail-closed flow:
 *   1. Hash the incoming raw token
 *   2. Find session by ID where hash matches AND not revoked AND not expired
 *   3. If no match → return null (token reuse / revoked / expired)
 *   4. Generate new refresh token, replace hash in DB, update lastSeenAt
 *   5. Return new token + session metadata
 *
 * The old refresh token is invalidated immediately by replacing the hash.
 */
export async function rotateSession(
    sessionId: string,
    rawRefreshToken: string,
): Promise<{ newRefreshToken: string; workerId: string; orgId: string } | null> {
    if (!sessionId || !rawRefreshToken) return null;

    const incomingHash = hashToken(rawRefreshToken);

    const now = new Date();

    // DB-level filter: only match sessions that are not revoked and not expired.
    // Uses @@index([expiresAt]) for efficient scanning.
    const session = await prisma.session.findFirst({
        where: {
            id: sessionId,
            revokedAt: null,
            expiresAt: { gt: now },
        },
        select: {
            id: true,
            userId: true,
            orgId: true,
            refreshTokenHash: true,
        },
    });

    // ── Fail-closed: no valid session found ──────────────────────────
    if (!session) return null;

    // Constant-time comparison — no early return based on format or content.
    // Both values are always converted to fixed-length 32-byte buffers.
    if (!safeHashEqual(session.refreshTokenHash, incomingHash)) {
        // Hash mismatch → possible token reuse attack. Revoke the session.
        await prisma.session.update({
            where: { id: sessionId },
            data: { revokedAt: new Date() },
        }).catch(() => { });
        return null;
    }

    // ── Validate org membership is still active ──────────────────────
    const stillMember = await validateMembership(session.userId, session.orgId);
    if (!stillMember) return null; // membership revoked since login — fail closed

    // ── Rotate: atomic compare-and-swap ──────────────────────────────
    // Uses updateMany with the old hash as a CAS guard. If another
    // request already rotated the token (hash changed), count === 0
    // and we fail-closed — no duplicate token issuance.
    const newRefreshToken = randomBytes(32).toString('hex');
    const newHash = hashToken(newRefreshToken);

    const updated = await prisma.session.updateMany({
        where: {
            id: sessionId,
            refreshTokenHash: incomingHash, // CAS guard
            revokedAt: null,
        },
        data: {
            refreshTokenHash: newHash,
            lastSeenAt: new Date(),
        },
    });

    if (updated.count === 0) {
        // Lost CAS race — another request already rotated. Fail-closed.
        return null;
    }

    // orgId comes from the session row — deterministic, bound at login
    return {
        newRefreshToken,
        workerId: session.userId,
        orgId: session.orgId,
    };
}

/**
 * Validate that a worker currently belongs to a specific organization.
 * Returns true only if an active relationship exists.
 *
 * Use this before granting access to org-scoped resources.
 */
export async function validateMembership(workerId: string, orgId: string): Promise<boolean> {
    if (!workerId || !orgId) return false;

    const rel = await prisma.workerOrgRelationship.findFirst({
        where: { workerId, orgId },
        select: { id: true },
    });

    return rel !== null;
}

/**
 * Revoke a session by setting revokedAt to now.
 * Idempotent — safe to call multiple times.
 */
export async function revokeSession(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
    }).catch(() => {
        // Swallow not-found errors — session may already be deleted or invalid
    });
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two SHA-256 hex-encoded hashes.
 *
 * Guarantees:
 *   - Both inputs are always converted to fixed-length 32-byte Buffers
 *   - Invalid hex → Buffer.alloc(32) zero-fill (guaranteed false, same timing)
 *   - No early return based on format, length, or content
 *   - Uses crypto.timingSafeEqual which compares every byte regardless of position
 */
function safeHashEqual(storedHex: string, incomingHex: string): boolean {
    // SHA-256 digest is always 32 bytes (64 hex chars).
    // Convert hex to raw bytes. If hex is invalid, Buffer.from returns
    // a shorter/empty buffer — we pad to exactly 32 bytes with zeros
    // so timingSafeEqual always receives equal-length inputs.
    const HASH_BYTE_LEN = 32;
    const a = toFixedBuffer(storedHex, HASH_BYTE_LEN);
    const b = toFixedBuffer(incomingHex, HASH_BYTE_LEN);
    return timingSafeEqual(a, b);
}

/**
 * Convert a hex string to a fixed-length Buffer.
 * If the hex is invalid or wrong length, returns a zero-filled buffer
 * (guaranteed-false comparison, same timing path).
 */
function toFixedBuffer(hex: string, byteLen: number): Buffer {
    const buf = Buffer.alloc(byteLen); // zero-filled
    if (typeof hex !== 'string' || hex.length !== byteLen * 2) {
        return buf; // wrong length → zero buffer → guaranteed mismatch, uniform timing
    }
    try {
        const parsed = Buffer.from(hex, 'hex');
        if (parsed.length === byteLen) {
            parsed.copy(buf);
        }
        // else: malformed hex decoded to wrong length → stays zero-filled
    } catch {
        // Invalid hex chars → stays zero-filled
    }
    return buf;
}

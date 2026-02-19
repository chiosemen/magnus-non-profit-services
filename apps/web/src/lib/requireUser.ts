import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME, verifyAppToken, type AppJwtPayload } from '@/lib/auth';
import { verifySession, validateMembership } from '@/lib/session';

/**
 * SSR guard for Server Components behind /app/*.
 *
 * Enforces ALL four session-binding invariants:
 *   1. JWT signature + expiry
 *   2. Session exists, not revoked, not expired
 *   3. jwt.orgId === session.orgId
 *   4. Worker still belongs to org
 *
 * Returns verified claims on success.
 * Redirects to /login on ANY failure (fail closed).
 */
export async function requireUser(): Promise<AppJwtPayload> {
    const token = cookies().get(AUTH_COOKIE_NAME)?.value;
    if (!token) redirect('/login');

    let payload: AppJwtPayload;
    try {
        payload = verifyAppToken(token);
    } catch {
        redirect('/login');
    }

    // INV-2: session exists + not revoked + not expired
    const session = await verifySession(payload.sessionId);
    if (!session) redirect('/login');

    // INV-3: orgId cross-check (detect tampered JWT)
    if (payload.orgId !== session.orgId) redirect('/login');

    // INV-4: membership still active
    const isMember = await validateMembership(payload.workerId, payload.orgId);
    if (!isMember) redirect('/login');

    return payload;
}

/**
 * Magnus Web — CSRF Origin Enforcement
 *
 * Problem:
 *   Cookie-auth mutation routes (login, register, logout, refresh) use SameSite=Lax
 *   cookies. SameSite=Lax prevents cross-site POSTs from third-party sites in most
 *   browsers, but is NOT a complete CSRF control because:
 *   - It does not protect top-level navigation POSTs (e.g. form submissions from
 *     attacker's site that navigate the browser).
 *   - Browser support guarantees vary across versions and platforms.
 *   - SameSite=None + Secure scenarios allow cross-site sends.
 *
 * Solution (double defense):
 *   1. Strict Origin/Referer check — validate that the HTTP Origin or Referer
 *      header matches the configured app origin.
 *   2. Custom request header requirement — all API mutations must include
 *      `X-Magnus-CSRF: 1`. Simple fetch() calls include custom headers; HTML form
 *      submissions and cross-site requests cannot set arbitrary headers from the
 *      attacker origin.
 *
 * Configuration:
 *   Set NEXT_PUBLIC_APP_URL to your production base URL, e.g. https://app.magnus.com
 *   In development, any localhost origin is permitted when NODE_ENV !== 'production'.
 *
 * IMPORTANT: This is origin-based CSRF protection (synchronizer-token-equivalent via
 *   the custom header). It does NOT require per-request CSRF tokens in the DB.
 *   For maximum hardening, a per-session CSRF token stored server-side is preferable —
 *   implement that in Wave 5 when full test coverage is established.
 */

export const CSRF_HEADER = 'x-magnus-csrf';

/**
 * Returns true if the request passes CSRF origin validation.
 *
 * Rules (applied in order):
 *  1. Custom header `X-Magnus-CSRF: 1` must be present.
 *  2. In production: Origin or Referer must match NEXT_PUBLIC_APP_URL.
 *  3. In development: allow any localhost/127.0.0.1 origin (permissive for DX).
 *
 * Returns false (should be rejected with 403) if any rule fails.
 */
export function validateCsrfOrigin(request: Request): boolean {
  // Rule 1: Require the custom header — HTML form submissions cannot set this
  const csrfHeader = request.headers.get(CSRF_HEADER);
  if (!csrfHeader || csrfHeader.trim() !== '1') {
    return false;
  }

  // Rule 2: In production, validate Origin or Referer against app URL
  if (process.env.NODE_ENV === 'production') {
    const appUrl = process.env['NEXT_PUBLIC_APP_URL']?.trim();
    if (!appUrl) {
      // Fail closed: if app URL is not configured in production, reject all mutations.
      // Set NEXT_PUBLIC_APP_URL in your deployment environment.
      return false;
    }

    let appOrigin: string;
    try {
      appOrigin = new URL(appUrl).origin;
    } catch {
      return false;
    }

    const origin = request.headers.get('origin');
    if (origin) {
      return origin === appOrigin;
    }

    // Fall back to Referer if Origin is absent
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        return refOrigin === appOrigin;
      } catch {
        return false;
      }
    }

    // Neither Origin nor Referer present in production → reject
    return false;
  }

  // Rule 3: Development — allow localhost/127.0.0.1/::1 origins
  // (or no origin header at all, e.g. curl/Postman in dev)
  const origin = request.headers.get('origin');
  if (!origin) return true; // curl/Postman dev scenario — allow

  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/**
 * Build a 403 CSRF rejection response.
 */
export function csrfRejectionResponse(): Response {
  return Response.json(
    {
      error: 'CSRF_VALIDATION_FAILED',
      message:
        'Request origin validation failed. Ensure the X-Magnus-CSRF: 1 header is included ' +
        'and the request originates from the authorized application.',
    },
    { status: 403 },
  );
}

import { NextResponse, type NextRequest } from 'next/server';
import { isMarketingOnly, isPublicMarketingPath, requiresAuthGate } from './lib/public-surface';

const COOKIE_NAME = 'magnus_token';

/**
 * Two deployments, one artifact.
 *
 * - Marketing deployment (MARKETING_ONLY=true): serves an allowlist of
 *   buyer-facing pages and returns an opaque 404 for everything else, so the
 *   public apex carries no `/login`, `/app/*` or `/api/*` surface while the
 *   application is READY_FOR_STAGING_PILOT. SPEC-P0 R14 / PS-1, PS-2.
 * - Application deployment (MARKETING_ONLY unset): unchanged P0-6 behaviour —
 *   `/app/:path*` is auth-gated, everything else passes through untouched.
 *   PS-6.
 *
 * The absence of application credentials in the marketing environment is the
 * primary control (enforced at boot by `assertMarketingOnlyEnvironment`); this
 * gate is defence in depth. See docs/security/PUBLIC-SURFACE-SEPARATION.md.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isMarketingOnly()) {
    if (isPublicMarketingPath(pathname)) return NextResponse.next();
    // Opaque by design: 403 would confirm the path exists and a redirect would
    // say where it went. No body, no mode-identifying header (PS-2).
    return new NextResponse(null, { status: 404 });
  }

  if (!requiresAuthGate(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return redirectToLogin(req);

  // Middleware runs in the Edge runtime; validate by calling a Node.js route handler.
  // Fail-closed: any error => redirect to login.
  try {
    const res = await fetch(new URL('/api/auth/me', req.url), {
      headers: {
        cookie: req.headers.get('cookie') ?? '',
      },
      cache: 'no-store',
    });
    if (!res.ok) return redirectToLogin(req);
  } catch {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  // `/app/:path*` is retained verbatim: the P0-6 regression test asserts this
  // exact matcher source survives in the built manifest. The second entry
  // widens coverage so the marketing gate can see every application path,
  // while build assets keep bypassing middleware entirely.
  matcher: ['/app/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};

function redirectToLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

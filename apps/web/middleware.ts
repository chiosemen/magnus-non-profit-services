import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_NAME = 'magnus_token';

export async function middleware(req: NextRequest) {
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
  matcher: ['/app/:path*'],
};

function redirectToLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}


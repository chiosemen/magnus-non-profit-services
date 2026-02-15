import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE_NAME = 'session';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
  if (!token) return redirectToLogin(req);

  try {
    const res = await fetch(new URL('/api/me', req.url), {
      headers: { cookie: req.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    if (!res.ok) return redirectToLogin(req);
  } catch {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};

function redirectToLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}


import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/tokens';

export const runtime = 'nodejs';

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

export async function GET(req: Request) {
  const token = cookies().get('session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }
  let auth: ReturnType<typeof verifyAccessToken>;
  try {
    auth = verifyAccessToken(token);
  } catch {
    return NextResponse.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }
  if (!auth.partnerId || !auth.partnerRole) {
    return NextResponse.json({ error: 'PARTNER_CONTEXT_REQUIRED' }, { status: 403 });
  }

  const base = orgDashboardBaseUrl();
  const incoming = new URL(req.url);
  const qs = incoming.searchParams.toString();
  const target = `${base}/api/partner/portfolio/export.csv${qs ? `?${qs}` : ''}`;

  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') ?? 'text/csv; charset=utf-8';
  const disposition = res.headers.get('content-disposition');

  if (!res.ok) {
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await res.arrayBuffer();
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  if (disposition) headers.set('Content-Disposition', disposition);

  return new NextResponse(body, { status: 200, headers });
}

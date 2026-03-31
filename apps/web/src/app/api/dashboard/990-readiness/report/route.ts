import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/auth/tokens';

export const runtime = 'nodejs';

function orgDashboardBaseUrl(): string {
  const fromEnv = process.env.ORG_DASHBOARD_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  return 'http://localhost:4010';
}

export async function GET() {
  const token = cookies().get('session')?.value;
  if (!token) return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } });

  try {
    verifyAccessToken(token);
  } catch {
    return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }

  const res = await fetch(`${orgDashboardBaseUrl()}/api/org/990/readiness`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response('Could not load readiness data', { status: res.status, headers: { 'Content-Type': 'text/plain' } });
  }

  const data = (await res.json()) as { status?: string; reportHtml?: string };
  if (data.status !== 'ready' || typeof data.reportHtml !== 'string' || data.reportHtml.length === 0) {
    return new Response('Report not available until a complete filing is saved.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response(data.reportHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="funder-readiness-report.html"',
    },
  });
}

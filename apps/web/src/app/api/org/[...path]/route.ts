import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifyAppToken } from '@/lib/auth';
import { getWebEnv } from '@/lib/env';
import { validateMembership, verifySession } from '@/lib/session';

export const runtime = 'nodejs';

type RouteContext = {
  params: {
    path: string[];
  };
};

async function proxy(req: Request, context: RouteContext): Promise<Response> {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  let payload;
  try {
    payload = verifyAppToken(token);
  } catch {
    return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });
  }

  const session = await verifySession(payload.sessionId);
  if (!session) {
    return Response.json({ error: 'SESSION_INVALID' }, { status: 401 });
  }
  if (payload.orgId !== session.orgId) {
    return Response.json({ error: 'SESSION_ORG_MISMATCH' }, { status: 401 });
  }
  if (!(await validateMembership(payload.workerId, payload.orgId))) {
    return Response.json({ error: 'MEMBERSHIP_REVOKED' }, { status: 401 });
  }

  const { ORG_DASHBOARD_API_BASE_URL } = getWebEnv();
  if (!ORG_DASHBOARD_API_BASE_URL) {
    return Response.json(
      {
        error: 'ORG_DASHBOARD_API_BASE_URL_NOT_CONFIGURED',
        detail:
          'Same-origin /api/org/* proxy is disabled. Use the org-dashboard-api base URL directly or set ORG_DASHBOARD_API_BASE_URL.',
      },
      { status: 501 },
    );
  }

  const incomingUrl = new URL(req.url);
  const targetUrl = new URL(`/api/org/${context.params.path.join('/')}`, ORG_DASHBOARD_API_BASE_URL);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(req.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-magnus-proxy', 'web-api-org');

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-length');
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(req: Request, context: RouteContext): Promise<Response> {
  return proxy(req, context);
}

export async function POST(req: Request, context: RouteContext): Promise<Response> {
  return proxy(req, context);
}

export async function PUT(req: Request, context: RouteContext): Promise<Response> {
  return proxy(req, context);
}

export async function PATCH(req: Request, context: RouteContext): Promise<Response> {
  return proxy(req, context);
}

export async function DELETE(req: Request, context: RouteContext): Promise<Response> {
  return proxy(req, context);
}


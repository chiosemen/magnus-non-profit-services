import { prisma } from '@magnus/db/client';
import { clearLoginFailures } from '@magnus/security';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken, verifyAccessToken } from '@/lib/auth/tokens';
import {
  cleanupAuthData,
  createOrganizationFixture,
  createSessionFixture,
  createUserFixture,
  createWorkerFixture,
  createWorkerRelationshipFixture,
} from '../../../../test/authDbTestUtils';

const requestContext = vi.hoisted(() => {
  let cookieValues = new Map<string, string>();
  let headerValues = new Map<string, string>();

  return {
    reset() {
      cookieValues = new Map();
      headerValues = new Map();
    },
    setCookies(values: Record<string, string>) {
      cookieValues = new Map(Object.entries(values));
    },
    setHeaders(values: Record<string, string>) {
      headerValues = new Map(
        Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]),
      );
    },
    cookies() {
      return {
        get(name: string) {
          const value = cookieValues.get(name);
          return value === undefined ? undefined : { name, value };
        },
      };
    },
    headers() {
      return {
        get(name: string) {
          return headerValues.get(name.toLowerCase()) ?? null;
        },
      };
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: requestContext.cookies,
  headers: requestContext.headers,
}));

const loginRoute = await import('./login/route');
const registerRoute = await import('./register/route');
const logoutRoute = await import('./logout/route');
const refreshRoute = await import('./refresh/route');
const meRoute = await import('./me/route');

const LOGIN_ORG_ID = '55555555-5555-4555-8555-555555555555';
const LOGIN_WORKER_ID = '66666666-6666-4666-8666-666666666666';
const LOGIN_EIN = '555000111';
const LOGIN_EMAIL = 'login@example.com';

const REGISTER_EIN = '777000222';
const REGISTER_EMAIL = 'register@example.com';

const LOGOUT_ORG_ID = '77777777-7777-4777-8777-777777777777';
const LOGOUT_USER_ID = '88888888-8888-4888-8888-888888888888';
const LOGOUT_EIN = '888000333';
const LOGOUT_EMAIL = 'logout@example.com';
const LOGOUT_REFRESH = 'logout-refresh-token';

const REFRESH_ORG_ID = '99999999-9999-4999-8999-999999999999';
const REFRESH_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REFRESH_EIN = '999000444';
const REFRESH_EMAIL = 'refresh@example.com';
const REFRESH_TOKEN = 'refresh-token-seed';

const ALL_EMAILS = [LOGIN_EMAIL, REGISTER_EMAIL, LOGOUT_EMAIL, REFRESH_EMAIL];
const ALL_EINS = [LOGIN_EIN, REGISTER_EIN, LOGOUT_EIN, REFRESH_EIN];

function createJsonRequest(pathname: string, body: unknown): Request {
  return new Request(`http://localhost${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };

  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const combined = response.headers.get('set-cookie');
  return combined ? combined.split(/,(?=\s*[A-Za-z0-9_-]+=)/) : [];
}

describe('web auth api routes', () => {
  beforeEach(async () => {
    requestContext.reset();
    await cleanupAuthData({ emails: ALL_EMAILS, eins: ALL_EINS });
  });

  afterEach(async () => {
    requestContext.reset();
    await cleanupAuthData({ emails: ALL_EMAILS, eins: ALL_EINS });
    await clearLoginFailures('10.0.0.1');
    await clearLoginFailures('10.0.0.2');
  });

  it('login success creates a user session and auth cookies', async () => {
    await createOrganizationFixture({
      id: LOGIN_ORG_ID,
      ein: LOGIN_EIN,
      name: 'Login Org',
    });
    await createWorkerFixture({
      id: LOGIN_WORKER_ID,
      email: LOGIN_EMAIL,
      password: 'strong-password',
      name: 'Login Worker',
    });
    await createWorkerRelationshipFixture({
      workerId: LOGIN_WORKER_ID,
      orgId: LOGIN_ORG_ID,
    });
    requestContext.setHeaders({ 'x-forwarded-for': '10.0.0.1' });

    const response = await loginRoute.POST(
      createJsonRequest('/api/auth/login', {
        ein: LOGIN_EIN,
        email: LOGIN_EMAIL,
        password: 'strong-password',
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const setCookies = getSetCookies(response);
    expect(setCookies.some((cookie) => cookie.includes('session='))).toBe(true);
    expect(setCookies.some((cookie) => cookie.includes('refresh='))).toBe(true);

    const storedUser = await prisma.user.findUnique({ where: { email: LOGIN_EMAIL } });
    expect(storedUser).not.toBeNull();
    expect(storedUser?.id).toBe(LOGIN_WORKER_ID);

    const sessions = await prisma.session.findMany({ where: { userId: LOGIN_WORKER_ID } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.orgId).toBe(LOGIN_ORG_ID);
  });

  it('login failure returns 401 and does not create a session', async () => {
    await createOrganizationFixture({
      id: LOGIN_ORG_ID,
      ein: LOGIN_EIN,
      name: 'Login Org',
    });
    await createWorkerFixture({
      id: LOGIN_WORKER_ID,
      email: LOGIN_EMAIL,
      password: 'correct-password',
      name: 'Login Worker',
    });
    await createWorkerRelationshipFixture({
      workerId: LOGIN_WORKER_ID,
      orgId: LOGIN_ORG_ID,
    });
    requestContext.setHeaders({ 'x-forwarded-for': '10.0.0.2' });

    const response = await loginRoute.POST(
      createJsonRequest('/api/auth/login', {
        ein: LOGIN_EIN,
        email: LOGIN_EMAIL,
        password: 'wrong-password',
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'CREDENTIALS_INVALID' });

    const sessions = await prisma.session.findMany({ where: { userId: LOGIN_WORKER_ID } });
    expect(sessions).toHaveLength(0);
  });

  it('register success creates auth records and auth cookies', async () => {
    const response = await registerRoute.POST(
      createJsonRequest('/api/auth/register', {
        orgName: 'Register Org',
        ein: REGISTER_EIN,
        name: 'Register User',
        email: REGISTER_EMAIL,
        password: 'register-password',
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const setCookies = getSetCookies(response);
    expect(setCookies.some((cookie) => cookie.includes('session='))).toBe(true);
    expect(setCookies.some((cookie) => cookie.includes('refresh='))).toBe(true);

    const organization = await prisma.organization.findUnique({ where: { ein: REGISTER_EIN } });
    const worker = await prisma.worker.findUnique({ where: { email: REGISTER_EMAIL } });
    const user = await prisma.user.findUnique({ where: { email: REGISTER_EMAIL } });
    const relationship = organization && worker
      ? await prisma.workerOrgRelationship.findFirst({
          where: { orgId: organization.id, workerId: worker.id },
        })
      : null;
    const sessions = user
      ? await prisma.session.findMany({ where: { userId: user.id } })
      : [];

    expect(organization?.name).toBe('Register Org');
    expect(worker?.name).toBe('Register User');
    expect(user?.name).toBe('Register User');
    expect(relationship).not.toBeNull();
    expect(sessions).toHaveLength(1);
  });

  it('logout revokes the matching session and clears auth cookies', async () => {
    await createOrganizationFixture({
      id: LOGOUT_ORG_ID,
      ein: LOGOUT_EIN,
      name: 'Logout Org',
    });
    await createUserFixture({
      id: LOGOUT_USER_ID,
      email: LOGOUT_EMAIL,
      name: 'Logout User',
    });
    await createSessionFixture({
      userId: LOGOUT_USER_ID,
      orgId: LOGOUT_ORG_ID,
      refreshToken: LOGOUT_REFRESH,
    });
    requestContext.setCookies({ refresh: LOGOUT_REFRESH });

    const response = await logoutRoute.POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('location')).toBe('/login');

    const setCookies = getSetCookies(response);
    expect(setCookies.filter((cookie) => cookie.includes('Max-Age=0')).length).toBe(2);

    const session = await prisma.session.findFirst({ where: { userId: LOGOUT_USER_ID } });
    expect(session?.revokedAt).not.toBeNull();
  });

  it('refresh rotates the session and issues new auth cookies', async () => {
    await createOrganizationFixture({
      id: REFRESH_ORG_ID,
      ein: REFRESH_EIN,
      name: 'Refresh Org',
    });
    await createUserFixture({
      id: REFRESH_USER_ID,
      email: REFRESH_EMAIL,
      name: 'Refresh User',
    });
    const originalSession = await createSessionFixture({
      userId: REFRESH_USER_ID,
      orgId: REFRESH_ORG_ID,
      refreshToken: REFRESH_TOKEN,
    });
    requestContext.setCookies({ refresh: REFRESH_TOKEN });
    requestContext.setHeaders({ 'x-forwarded-for': '10.0.0.3' });

    const response = await refreshRoute.POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const setCookies = getSetCookies(response);
    expect(setCookies.some((cookie) => cookie.includes('session='))).toBe(true);
    expect(setCookies.some((cookie) => cookie.includes('refresh='))).toBe(true);

    const sessions = await prisma.session.findMany({
      where: { userId: REFRESH_USER_ID },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.find((session) => session.id === originalSession.id)?.revokedAt).not.toBeNull();
    expect(sessions.filter((session) => session.revokedAt === null)).toHaveLength(1);
  });

  it('refresh returns auth required without a refresh cookie', async () => {
    requestContext.setHeaders({ 'x-forwarded-for': '10.0.0.4' });

    const response = await refreshRoute.POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'AUTH_REQUIRED' });
  });

  it('/api/auth/me returns the current auth payload for a valid session cookie', async () => {
    const token = signAccessToken({
      userId: REFRESH_USER_ID,
      orgId: REFRESH_ORG_ID,
      role: 'user',
    });
    requestContext.setCookies({ session: token });

    const response = await meRoute.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      payload: verifyAccessToken(token),
    });
  });

  it('/api/auth/me returns AUTH_REQUIRED without a session cookie', async () => {
    const response = await meRoute.GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'AUTH_REQUIRED' });
  });
});
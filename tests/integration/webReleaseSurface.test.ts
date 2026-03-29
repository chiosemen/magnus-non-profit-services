import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@magnus/db/client';
import { hashPassword } from '../../apps/web/src/lib/auth/password';
import { hashRefreshToken } from '../../apps/web/src/lib/auth/refresh';
import { signAccessToken } from '../../apps/web/src/lib/auth/tokens';

const nextHeadersState = vi.hoisted(() => {
  const cookieValues = new Map<string, string>();
  const headerValues = new Map<string, string>();

  return {
    reset() {
      cookieValues.clear();
      headerValues.clear();
    },
    setCookies(values: Record<string, string | undefined>) {
      cookieValues.clear();
      for (const [name, value] of Object.entries(values)) {
        if (typeof value === 'string') cookieValues.set(name, value);
      }
    },
    setHeaders(values: Record<string, string | undefined>) {
      headerValues.clear();
      for (const [name, value] of Object.entries(values)) {
        if (typeof value === 'string') headerValues.set(name.toLowerCase(), value);
      }
    },
    cookies() {
      return {
        get(name: string) {
          const value = cookieValues.get(name);
          return value ? { name, value } : undefined;
        },
        toString() {
          return Array.from(cookieValues.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
        },
      };
    },
    headers() {
      return new Headers(Array.from(headerValues.entries()));
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: () => nextHeadersState.cookies(),
  headers: () => nextHeadersState.headers(),
}));

const { POST: registerPost } = await import('../../apps/web/src/app/api/auth/register/route');
const { POST: loginPost } = await import('../../apps/web/src/app/api/login/route');
const { GET: meGet } = await import('../../apps/web/src/app/api/me/route');
const { GET: dashboardSummaryGet } = await import('../../apps/web/src/app/api/dashboard/summary/route');
const { POST: refreshPost } = await import('../../apps/web/src/app/api/auth/refresh/route');
const { POST: logoutPost } = await import('../../apps/web/src/app/api/auth/logout/route');
const { middleware } = await import('../../apps/web/middleware');

const trackedEmails = new Set<string>();
const trackedEins = new Set<string>();
const trackedUserIds = new Set<string>();
const trackedWorkerIds = new Set<string>();
const trackedOrgIds = new Set<string>();

beforeEach(() => {
  nextHeadersState.reset();
  vi.restoreAllMocks();
});

afterEach(async () => {
  await cleanupTrackedData();
  nextHeadersState.reset();
  vi.restoreAllMocks();
});

describe('web release surface integration', () => {
  it('POST /api/auth/register creates the org-scoped session for the live registration flow', async () => {
    const suffix = uniqueSuffix();
    const email = `register-${suffix}@web-test.magnus.local`;
    const ein = `92${suffix.slice(0, 7)}`;
    trackIdentity({ email, ein });

    const response = await registerPost(jsonRequest('http://localhost/api/auth/register', {
      orgName: 'Release Surface Org',
      ein,
      name: 'Release User',
      email,
      password: 'ValidPass123!',
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const createdOrg = await prisma.organization.findUnique({ where: { ein } });
    const createdWorker = await prisma.worker.findUnique({ where: { email } });
    const createdUser = await prisma.user.findUnique({ where: { email } });

    expect(createdOrg).toMatchObject({ ein, name: 'Release Surface Org' });
    expect(createdWorker).toMatchObject({ email, name: 'Release User' });
    expect(createdUser).toMatchObject({ email, name: 'Release User' });
    expect(createdUser?.id).toBe(createdWorker?.id);

    const session = createdUser
      ? await prisma.session.findFirst({ where: { userId: createdUser.id, orgId: createdOrg?.id } })
      : null;
    expect(session).not.toBeNull();

    const setCookie = collectSetCookie(response);
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('refresh=');
  });

  it('POST /api/login redirects to /dashboard and creates a session for the live login form', async () => {
    const email = `login-${uniqueSuffix()}@web-test.magnus.local`;
    const password = 'ValidPass123!';
    const ip = `198.51.100.${Math.floor(Math.random() * 100)}`;
    const { org, worker, user } = await seedMembershipFixture({ email, password, withUser: true });
    nextHeadersState.setHeaders({ 'x-forwarded-for': ip });

    const form = new FormData();
    form.set('email', email);
    form.set('password', password);

    const response = await loginPost(new Request('http://localhost/api/login', {
      method: 'POST',
      body: form,
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/dashboard');

    expect(user?.id).toBe(worker.id);

    const session = await prisma.session.findFirst({ where: { userId: worker.id, orgId: org.id } });
    expect(session).not.toBeNull();

    const setCookie = collectSetCookie(response);
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('refresh=');
  });

  it('GET /api/me rejects missing access cookies for the protected dashboard chain', async () => {
    nextHeadersState.setCookies({});

    const response = await meGet();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'AUTH_REQUIRED' });
  });

  it('GET /api/dashboard/summary returns the org and worker bound to the current session', async () => {
    const email = `summary-${uniqueSuffix()}@web-test.magnus.local`;
    const { org, worker } = await seedMembershipFixture({ email });
    const accessToken = signAccessToken({ userId: worker.id, orgId: org.id, role: 'user' });

    nextHeadersState.setCookies({ session: accessToken });

    const response = await dashboardSummaryGet();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      org: { id: org.id, ein: org.ein, name: org.name },
      worker: { id: worker.id, email: worker.email, name: worker.name },
    });
  });

  it('POST /api/auth/refresh rotates the refresh token and revokes the old session', async () => {
    const email = `refresh-${uniqueSuffix()}@web-test.magnus.local`;
    const ip = `203.0.113.${Math.floor(Math.random() * 100)}`;
    const refreshToken = `refresh-${uniqueSuffix()}`;
    const { org, worker, user } = await seedMembershipFixture({ email, withUser: true });

    const oldSession = await prisma.session.create({
      data: {
        userId: user.id,
        orgId: org.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastSeenAt: new Date(),
      },
    });

    nextHeadersState.setCookies({ refresh: refreshToken });
    nextHeadersState.setHeaders({ 'x-forwarded-for': ip });

    const response = await refreshPost();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const sessions = await prisma.session.findMany({
      where: { userId: user.id, orgId: org.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(sessions).toHaveLength(2);
    const revoked = sessions.find(session => session.id === oldSession.id);
    const rotated = sessions.find(session => session.id !== oldSession.id);

    expect(revoked?.revokedAt).not.toBeNull();
    expect(rotated?.revokedAt).toBeNull();
    expect(rotated?.refreshTokenHash).not.toBe(oldSession.refreshTokenHash);
    expect(rotated?.userId).toBe(worker.id);

    const setCookie = collectSetCookie(response);
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('refresh=');
  });

  it('POST /api/auth/logout revokes the current session and clears auth cookies', async () => {
    const email = `logout-${uniqueSuffix()}@web-test.magnus.local`;
    const refreshToken = `refresh-${uniqueSuffix()}`;
    const { org, user } = await seedMembershipFixture({ email, withUser: true });

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        orgId: org.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastSeenAt: new Date(),
      },
    });

    nextHeadersState.setCookies({ refresh: refreshToken });

    const response = await logoutPost();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const revoked = await prisma.session.findUnique({ where: { id: session.id } });
    expect(revoked?.revokedAt).not.toBeNull();

    const setCookie = collectSetCookie(response);
    expect(setCookie).toContain('session=;');
    expect(setCookie).toContain('refresh=;');
    expect(response.headers.get('location')).toBe('/login');
  });

  it('middleware redirects unauthenticated dashboard requests to login with the next path preserved', async () => {
    const request = new NextRequest('https://app.magnus.local/dashboard?tab=summary');

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://app.magnus.local/login?next=%2Fdashboard%3Ftab%3Dsummary',
    );
  });

  it('middleware allows dashboard requests with a valid session cookie after /api/me succeeds', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ userId: randomUUID(), orgId: randomUUID(), role: 'user' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const request = new NextRequest('https://app.magnus.local/dashboard', {
      headers: { cookie: 'session=test-access-token' },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/me', request.url),
      expect.objectContaining({
        cache: 'no-store',
        headers: { cookie: 'session=test-access-token' },
      }),
    );
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function collectSetCookie(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie().join('\n');
  }
  return response.headers.get('set-cookie') ?? '';
}

function uniqueSuffix(): string {
  return Date.now().toString() + Math.random().toString(16).slice(2, 8);
}

function trackIdentity(input: {
  email?: string;
  ein?: string;
  userId?: string;
  workerId?: string;
  orgId?: string;
}) {
  if (input.email) trackedEmails.add(input.email);
  if (input.ein) trackedEins.add(input.ein);
  if (input.userId) trackedUserIds.add(input.userId);
  if (input.workerId) trackedWorkerIds.add(input.workerId);
  if (input.orgId) trackedOrgIds.add(input.orgId);
}

async function seedMembershipFixture(input: {
  email: string;
  password?: string;
  withUser?: boolean;
}) {
  const orgId = randomUUID();
  const workerId = randomUUID();
  const ein = `93${uniqueSuffix().slice(0, 7)}`;
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  trackIdentity({
    email: input.email,
    ein,
    orgId,
    workerId,
    ...(input.withUser ? { userId: workerId } : {}),
  });

  const org = await prisma.organization.create({
    data: {
      id: orgId,
      ein,
      name: `Web Fixture ${orgId.slice(0, 8)}`,
      subscriptionTier: 'ENTERPRISE',
    },
  });

  const worker = await prisma.worker.create({
    data: {
      id: workerId,
      email: input.email,
      name: 'Web Test User',
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  await prisma.workerOrgRelationship.create({
    data: {
      workerId,
      orgId,
      relationshipType: 'CONTRACTOR_1099',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      grantFunded: false,
    },
  });

  const user = input.withUser
    ? await prisma.user.create({
      data: {
        id: workerId,
        email: input.email,
        name: 'Web Test User',
        ...(passwordHash ? { passwordHash } : {}),
      },
    })
    : null;

  return { org, worker, user };
}

async function cleanupTrackedData() {
  const emails = Array.from(trackedEmails);
  const eins = Array.from(trackedEins);

  const usersByEmail = emails.length > 0
    ? await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } })
    : [];
  const workersByEmail = emails.length > 0
    ? await prisma.worker.findMany({ where: { email: { in: emails } }, select: { id: true } })
    : [];
  const orgsByEin = eins.length > 0
    ? await prisma.organization.findMany({ where: { ein: { in: eins } }, select: { id: true } })
    : [];

  const userIds = Array.from(new Set([
    ...trackedUserIds,
    ...usersByEmail.map(user => user.id),
  ]));
  const workerIds = Array.from(new Set([
    ...trackedWorkerIds,
    ...workersByEmail.map(worker => worker.id),
  ]));
  const orgIds = Array.from(new Set([
    ...trackedOrgIds,
    ...orgsByEin.map(org => org.id),
  ]));

  if (userIds.length > 0 || orgIds.length > 0) {
    const where = [];
    if (userIds.length > 0) where.push({ userId: { in: userIds } });
    if (orgIds.length > 0) where.push({ orgId: { in: orgIds } });
    await prisma.session.deleteMany({ where: { OR: where } });
  }

  if (workerIds.length > 0 || orgIds.length > 0) {
    const where = [];
    if (workerIds.length > 0) where.push({ workerId: { in: workerIds } });
    if (orgIds.length > 0) where.push({ orgId: { in: orgIds } });
    await prisma.workerOrgRelationship.deleteMany({ where: { OR: where } });
  }

  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (workerIds.length > 0) {
    await prisma.worker.deleteMany({ where: { id: { in: workerIds } } });
  }

  if (orgIds.length > 0) {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }

  trackedEmails.clear();
  trackedEins.clear();
  trackedUserIds.clear();
  trackedWorkerIds.clear();
  trackedOrgIds.clear();
}

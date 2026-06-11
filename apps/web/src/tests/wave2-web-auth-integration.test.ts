import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/auth/login/route';
import { _resetLimiterForTest } from '../lib/rate-limit';

declare namespace jest {
  type Mock = {
    (...args: unknown[]): unknown;
    mockClear(): void;
    mockResolvedValue(value: unknown): Mock;
    mockResolvedValueOnce(value: unknown): Mock;
    mockReturnValue(value: unknown): Mock;
  };
}

declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
  fn(): jest.Mock;
};

// Thin harness to mock next/headers for node context testing of the NextJS App Router endpoint
let mockHeaders = new Map<string, string>();
let mockCookies = new Map<string, string>();

jest.mock('next/headers', () => ({
  headers: () => ({
    get: (key: string) => mockHeaders.get(key) || null,
  }),
  cookies: () => ({
    set: (args: any) => mockCookies.set(args.name, args.value),
  })
}));

// We only stub Prisma lookups so we don't need a real Postgres instance.
// But we keep the exact Rate Limit / CSRF logic intact.
jest.mock('@magnus/db/client', () => ({
  prisma: {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org-1', ein: '12-3456789' }),
    },
    worker: {
      findUnique: jest.fn().mockResolvedValue({ id: 'worker-1', passwordHash: 'hash' }),
    },
    workerOrgRelationship: {
      findFirst: jest.fn().mockResolvedValue({ id: 'rel-1' })
    }
  }
}));

import bcrypt from 'bcryptjs';
jest.mock('bcryptjs', () => ({
  compare: jest.fn()
}));

// We mock session creation to avoid Redis/JWT generation deep internals 
// just for this test, focusing on the route boundary.
jest.mock('../lib/session', () => ({
  createSession: jest.fn().mockResolvedValue({ sessionId: 's-1', refreshToken: 'r-1' })
}));
jest.mock('../lib/auth', () => ({
  signAppToken: jest.fn().mockReturnValue('fake-valid-jwt'),
  AUTH_COOKIE_NAME: 'magnus_auth',
  REFRESH_COOKIE_NAME: 'magnus_refresh',
}));


describe('Wave 2: Web Auth & Rate Limiting Integration', () => {

  beforeEach(() => {
    mockHeaders.clear();
    mockCookies.clear();
    _resetLimiterForTest(); 
    (bcrypt.compare as jest.Mock).mockClear();
    
    // Default valid origins for CSRF
    mockHeaders.set('host', 'localhost:3000');
    mockHeaders.set('origin', 'http://localhost:3000');
    mockHeaders.set('x-forwarded-for', `test-ip-${Date.now()}`); 
  });

  afterEach(() => {
    _resetLimiterForTest();
  });

  const makeJsonRequest = (body: any) => new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  test('Reject invalid CSRF origin abruptly', async () => {
    mockHeaders.set('origin', 'http://malicious-site.com'); // Mismatched origin
    
    const req = makeJsonRequest({ ein: '12-3456789', email: 'test@example.com', password: 'password123' });
    const res = await POST(req);
    
    assert.equal(res.status, 403, 'CSRF failure must return 403 Forbidden');
    const json = await res.json();
    assert.equal(json.error, 'ORIGIN_MISMATCH', 'Must clearly trap unauthorized headers');
  });

  test('Successful login path under valid CSRF executes and bypasses throttling', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true); // Password valid
    
    const req = makeJsonRequest({ ein: '12-3456789', email: 'test@example.com', password: 'password123' });
    const res = await POST(req);
    
    assert.equal(res.status, 200, 'Must return 200 OK');
    const json = await res.json();
    assert.equal(json.ok, true);
    
    // Assert cookies were pushed
    assert.ok(mockCookies.has('magnus_auth'), 'Auth cookie must be appended');
    assert.ok(mockCookies.has('magnus_refresh'), 'Refresh cookie must be appended');
  });

  test('Repeated auth failures trigger shared limiter behavior (429 Rate Limit)', async () => {
    // 1. We keep failing the password
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    let finalRes: Response;
    let blockCount = 0;

    // Simulate 6 rapid-fire failures against the same test IP
    mockHeaders.set('x-forwarded-for', 'ip-targeted-brute-force');

    for (let i = 0; i < 6; i++) {
       const req = makeJsonRequest({ ein: '12-3456789', email: 'test@example.com', password: `bad-pass-${i}` });
       const res = await POST(req);
       if (res.status === 429) {
         blockCount++;
         finalRes = res;
       } else {
         assert.equal(res.status, 401, 'Normal failures return 401');
       }
    }

    assert.equal(blockCount, 1, 'Only the 6th stroke should trigger the boundary (max limit 5)');
    assert.equal(finalRes!.status, 429, 'Rate limit explicitly enforced route rejection');
    
    const json = await finalRes!.json();
    assert.equal(json.error, 'RATE_LIMITED');
    assert.ok(json.retryAfterSec > 0, 'Must advise retry timeout');
  });

});

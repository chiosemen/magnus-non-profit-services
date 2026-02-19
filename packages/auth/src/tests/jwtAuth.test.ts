import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createJwtAuthMiddleware } from '../jwtAuth';

test('missing token returns 401', async () => {
  const mw = createJwtAuthMiddleware({ jwtSecret: 'x'.repeat(32) });
  const req: any = { headers: {} };

  let status: number | null = null;
  let body: any = null;
  const res: any = {
    status: (s: number) => {
      status = s;
      return res;
    },
    json: (b: any) => {
      body = b;
      return res;
    },
  };

  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(status, 401);
  assert.deepEqual(body, { error: 'AUTH_REQUIRED' });
});

test('valid token attaches req.auth', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1', workerId: 'w1', role: 'user' }, secret, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

  const mw = createJwtAuthMiddleware({ jwtSecret: secret });
  const req: any = { headers: { authorization: `Bearer ${token}` } };
  const res: any = { status: () => res, json: () => res };

  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.auth, { orgId: 'org1', workerId: 'w1', role: 'user' });
});


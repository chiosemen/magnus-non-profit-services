import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerTierGuard } from '../middleware/workerTierGuard';

test('FREE worker is blocked from premium endpoints', async () => {
  const db: any = {
    worker: { findUnique: async () => ({ workerTier: 'FREE' }) },
  };
  const guard = createWorkerTierGuard(db)('income_optimizer_alerts');

  const req: any = { auth: { workerId: 'w1' }, header: () => undefined };
  let status: number | null = null;
  let body: any = null;
  const res: any = {
    status: (s: number) => {
      status = s;
      return res;
    },
    json: (b: any) => {
      body = b;
    },
  };

  let nextCalled = false;
  await guard(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(status, 403);
  assert.deepEqual(body, { error: 'WORKER_TIER_REQUIRED' });
});

test('PREMIUM worker can access premium endpoints', async () => {
  const db: any = {
    worker: { findUnique: async () => ({ workerTier: 'PREMIUM' }) },
  };
  const guard = createWorkerTierGuard(db)('volatility_analysis');

  const req: any = { auth: { workerId: 'w1' }, header: () => undefined };
  const res: any = { status: () => res, json: () => {} };

  let nextCalled = false;
  await guard(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

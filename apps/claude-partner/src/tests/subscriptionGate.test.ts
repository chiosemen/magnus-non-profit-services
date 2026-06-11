import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaudePartnerSubscriptionGate } from '../api/subscriptionGate';

const secret = 'claude-partner-subscription-gate-test-secret-32';

function response(resolve: () => void) {
  const res: any = {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      resolve();
      return res;
    },
  };
  return res;
}

function dbFor(orgs: Record<string, { subscriptionTier: string; subscriptionStatus: string }>, onLookup?: () => void): any {
  return {
    organization: {
      findUnique: async ({ where }: any) => {
        onLookup?.();
        return orgs[where.id] ?? null;
      },
    },
  };
}

test('Claude Partner gate denies starter org before handler', async () => {
  process.env.JWT_SECRET = secret;
  const gate = createClaudePartnerSubscriptionGate(dbFor({
    org_starter: { subscriptionTier: 'STARTER', subscriptionStatus: 'ACTIVE' },
  }) as any);
  let reached = false;

  await new Promise<void>(resolve => {
    gate(
      { auth: { orgId: 'org_starter', sub: 'worker_1' }, headers: {}, path: '/api/claude/messages' } as any,
      response(resolve),
      () => {
        reached = true;
        resolve();
      },
    );
  });

  assert.equal(reached, false);
});

test('Claude Partner gate denies inactive subscription consistently', async () => {
  process.env.JWT_SECRET = secret;
  const gate = createClaudePartnerSubscriptionGate(dbFor({
    org_inactive: { subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'PAST_DUE' },
  }) as any);
  const res = await new Promise<any>(resolve => {
    const out = response(() => resolve(out));
    gate(
      { auth: { orgId: 'org_inactive', sub: 'worker_1' }, headers: {}, path: '/api/claude/config' } as any,
      out,
      () => resolve(out),
    );
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'SUBSCRIPTION_NOT_ACTIVE' });
});

test('Claude Partner gate allows enterprise orgs', async () => {
  process.env.JWT_SECRET = secret;
  const gate = createClaudePartnerSubscriptionGate(dbFor({
    org_enterprise: { subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'ACTIVE' },
  }) as any);
  let reached = false;

  await new Promise<void>(resolve => {
    gate(
      { auth: { orgId: 'org_enterprise', sub: 'worker_1' }, headers: {}, path: '/api/claude/messages' } as any,
      response(resolve),
      () => {
        reached = true;
        resolve();
      },
    );
  });

  assert.equal(reached, true);
});

test('Claude Partner gate does not query subscription store without auth', async () => {
  process.env.JWT_SECRET = secret;
  let lookups = 0;
  const gate = createClaudePartnerSubscriptionGate(dbFor({}, () => { lookups += 1; }) as any);
  const res = await new Promise<any>(resolve => {
    const out = response(() => resolve(out));
    gate({ headers: {}, path: '/api/claude/messages' } as any, out, () => resolve(out));
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'AUTH_REQUIRED' });
  assert.equal(lookups, 0);
});

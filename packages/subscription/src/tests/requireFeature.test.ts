import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { requireFeature } from '../middleware/requireFeature';
import { AuthRequiredError, InvalidTokenError, SubscriptionNotActiveError, FeatureNotEnabledError } from '../errors';

test('requireFeature fails if Authorization missing', async () => {
  const mw = requireFeature('claude_partner', {
    jwtSecret: 'x'.repeat(32),
    db: fakeDb({ tier: 'ENTERPRISE', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: {} });
  assert.ok(err instanceof AuthRequiredError);
});

test('requireFeature fails if token invalid', async () => {
  const mw = requireFeature('claude_partner', {
    jwtSecret: 'x'.repeat(32),
    db: fakeDb({ tier: 'ENTERPRISE', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: 'Bearer not-a-jwt' } });
  assert.ok(err instanceof InvalidTokenError);
});

test('requireFeature blocks when subscription not ACTIVE', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('grant_generator', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'ENTERPRISE', status: 'PAST_DUE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(err instanceof SubscriptionNotActiveError);
});

test('requireFeature blocks when feature not enabled by tier', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('claude_partner', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'STARTER', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(err instanceof FeatureNotEnabledError);
});

function fakeDb(params: { tier: any; status: any }): any {
  return {
    organization: {
      findUnique: async () => ({ subscriptionTier: params.tier, subscriptionStatus: params.status }),
    },
  };
}

async function runMw(mw: any, req: any): Promise<any> {
  return await new Promise(resolve => {
    mw(req, {}, (err: any) => resolve(err));
  });
}


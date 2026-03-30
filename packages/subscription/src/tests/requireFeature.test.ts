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

// ─── Allowed Cases ──────────────────────────────────────────────────────────

test('STARTER allows compliance_calendar', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('compliance_calendar', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'STARTER', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(err, undefined, 'STARTER should allow compliance_calendar');
});

test('GROWTH allows grant_generator', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('grant_generator', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(err, undefined, 'GROWTH should allow grant_generator');
});

test('ENTERPRISE allows claude_partner', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('claude_partner', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'ENTERPRISE', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(err, undefined, 'ENTERPRISE should allow claude_partner');
});

test('ENTERPRISE allows worker_financial_layer', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('worker_financial_layer', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'ENTERPRISE', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(err, undefined, 'ENTERPRISE should allow worker_financial_layer');
});

test('ENTERPRISE allows agents_layer', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('agents_layer', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'ENTERPRISE', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(err, undefined, 'ENTERPRISE should allow agents_layer');
});

test('ENTERPRISE allows institutional_partner', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('institutional_partner', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'ENTERPRISE', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(err, undefined, 'ENTERPRISE should allow institutional_partner');
});

test('GROWTH denies institutional_partner', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('institutional_partner', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(err instanceof FeatureNotEnabledError, 'GROWTH should deny institutional_partner');
});

// ─── Denied Cases ───────────────────────────────────────────────────────────

test('STARTER denies grant_generator', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('grant_generator', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'STARTER', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(err instanceof FeatureNotEnabledError, 'STARTER should deny grant_generator');
});

test('STARTER allows grant_generator when institutional program whitelists it', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('grant_generator', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'STARTER', status: 'ACTIVE', programGrantsFeature: 'grant_generator' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(err, undefined);
});

test('GROWTH denies claude_partner', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('claude_partner', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(err instanceof FeatureNotEnabledError, 'GROWTH should deny claude_partner');
});

test('GROWTH denies worker_financial_layer', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('worker_financial_layer', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(err instanceof FeatureNotEnabledError, 'GROWTH should deny worker_financial_layer');
});

test('GROWTH denies agents_layer', async () => {
  const secret = 'x'.repeat(32);
  const token = jwt.sign({ orgId: 'org1' }, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const mw = requireFeature('agents_layer', {
    jwtSecret: secret,
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(err instanceof FeatureNotEnabledError, 'GROWTH should deny agents_layer');
});

function fakeDb(params: { tier: any; status: any; programGrantsFeature?: string }): any {
  return {
    organization: {
      findUnique: async () => ({ subscriptionTier: params.tier, subscriptionStatus: params.status }),
    },
    partnerOrgMembership: {
      findFirst: async (args: { where?: { program?: { enabledFeatures?: { has?: string } } } }) => {
        const want = args?.where?.program?.enabledFeatures?.has;
        if (params.programGrantsFeature && want === params.programGrantsFeature) {
          return { id: 'm1' };
        }
        return null;
      },
    },
  };
}

async function runMw(mw: any, req: any): Promise<any> {
  return await new Promise(resolve => {
    mw(req, {}, (err: any) => resolve(err));
  });
}


import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { requireFeature } from '../middleware/requireFeature';
import { AuthRequiredError, InvalidTokenError, SubscriptionNotActiveError, FeatureNotEnabledError } from '../errors';
import { ORG_DASHBOARD_ROUTE_FEATURES, featureForMcpTool } from '../routeFeatureMap';

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

test('requireFeature reuses authenticated req.auth org context after upstream auth', async () => {
  let lookups = 0;
  const mw = requireFeature('grant_generator', {
    jwtSecret: 'x'.repeat(32),
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE', onLookup: () => { lookups += 1; } }),
  });

  const err = await runMw(mw, { auth: { orgId: 'org_growth', sub: 'user_1' }, headers: {} });
  assert.equal(err, undefined);
  assert.equal(lookups, 1);
});

test('requireFeature rejects client-provided conflicting orgId before handler', async () => {
  const mw = requireFeature('grant_generator', {
    jwtSecret: 'x'.repeat(32),
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE' }),
  });

  const err = await runMw(mw, {
    auth: { orgId: 'org_growth' },
    body: { orgId: 'org_other' },
    headers: {},
  });
  assert.ok(err instanceof InvalidTokenError);
});

test('requireFeature does not hit subscription store when auth is missing', async () => {
  let lookups = 0;
  const mw = requireFeature('grant_generator', {
    jwtSecret: 'x'.repeat(32),
    db: fakeDb({ tier: 'GROWTH', status: 'ACTIVE', onLookup: () => { lookups += 1; } }),
  });

  const err = await runMw(mw, { headers: {} });
  assert.ok(err instanceof AuthRequiredError);
  assert.equal(lookups, 0);
});

test('route and MCP feature maps use current subscription policy keys', () => {
  assert.equal(ORG_DASHBOARD_ROUTE_FEATURES.campaignAdmin, 'autonomous_ops_standard');
  assert.equal(ORG_DASHBOARD_ROUTE_FEATURES.fundAccounting, 'autonomous_ops_standard');
  assert.equal(ORG_DASHBOARD_ROUTE_FEATURES.conciergeAi, 'autonomous_ops_standard');
  assert.equal(ORG_DASHBOARD_ROUTE_FEATURES.grants, 'grant_generator');
  assert.equal(ORG_DASHBOARD_ROUTE_FEATURES.boardAndExecutivePackets, 'autonomous_ops_assisted');
  assert.equal(featureForMcpTool('get-funder-research'), 'grant_generator');
  assert.equal(featureForMcpTool('get-tax-estimates'), 'worker_financial_layer');
  assert.equal(featureForMcpTool('draft-board-packet'), 'autonomous_ops_assisted');
  assert.equal(featureForMcpTool('unknown-premium-tool'), null);
});

function fakeDb(params: { tier: any; status: any; onLookup?: () => void }): any {
  return {
    organization: {
      findUnique: async () => {
        params.onLookup?.();
        return { subscriptionTier: params.tier, subscriptionStatus: params.status };
      },
    },
  };
}

async function runMw(mw: any, req: any): Promise<any> {
  return await new Promise(resolve => {
    mw(req, {}, (err: any) => resolve(err));
  });
}

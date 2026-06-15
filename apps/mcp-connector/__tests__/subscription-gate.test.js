const { test } = require('node:test');
const assert = require('node:assert/strict');
const { featureForMcpTool } = require('@magnus/subscription');
const { mcpToolSubscriptionGate } = require('../dist/subscriptionGate');

process.env.JWT_SECRET = 'mcp-subscription-gate-test-secret-at-least-32';

function response(resolve) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      resolve(res);
      return res;
    },
  };
  return res;
}

test('MCP tool feature map assigns premium nonprofit tools and denies unknown mappings', () => {
  assert.equal(featureForMcpTool('get-funder-research'), 'mcp_tools');
  assert.equal(featureForMcpTool('get-tax-estimates'), 'mcp_tools');
  assert.equal(featureForMcpTool('draft-board-packet'), 'mcp_tools');
  assert.equal(featureForMcpTool('fabricate-tax-return'), null);
});

test('MCP subscription gate denies unmapped tools before handler', async () => {
  const gate = mcpToolSubscriptionGate();
  let reached = false;
  const res = await new Promise(resolve => {
    gate(
      { body: { toolName: 'fabricate-tax-return' }, headers: {}, auth: { orgId: 'org_1', sub: 'worker_1' } },
      response(resolve),
      () => {
        reached = true;
        resolve({ statusCode: 200, body: null });
      },
    );
  });

  assert.equal(reached, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'FEATURE_NOT_ENABLED' });
});

test('MCP subscription gate does not reach handler when auth context is absent', async () => {
  const gate = mcpToolSubscriptionGate();
  let reached = false;
  const res = await new Promise(resolve => {
    gate(
      { body: { toolName: 'get-funder-research' }, headers: {} },
      response(resolve),
      () => {
        reached = true;
        resolve({ statusCode: 200, body: null });
      },
    );
  });

  assert.equal(reached, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'AUTH_REQUIRED' });
});

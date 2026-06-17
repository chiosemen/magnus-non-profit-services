const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { featureForMcpTool } = require('@magnus/subscription');
const { mcpToolSubscriptionGate } = require('../dist/subscriptionGate');

process.env.JWT_SECRET = 'mcp-subscription-gate-test-secret-at-least-32';
process.env.JWT_ISSUER = 'magnus-mcp-connector';
process.env.JWT_AUDIENCE = 'magnus-nonprofit-os';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/magnus_mcp_test?schema=public';

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

test('MCP denied unknown tool fails closed before AuditLogger receives raw params', async () => {
  const audit = captureAuditLogs();
  try {
    const app = require('../dist/server').default;
    const token = signToken();
    const secretPayload = {
      donorName: 'Jane Private Donor',
      token: 'super-secret-token-value',
      paymentCard: '4242-4242-4242-4242',
    };

    const res = await request(app)
      .post('/tools/execute')
      .set('Authorization', `Bearer ${token}`)
      .set('x-request-id', 'req_denied_privacy')
      .send({ toolName: 'fabricate-tax-return', params: secretPayload });

    assert.equal(res.status, 403);
    assert.deepEqual(res.body, { error: 'FEATURE_NOT_ENABLED' });
    assert.equal(audit.toolCalls.length, 0);
    assert.doesNotMatch(JSON.stringify(audit), /Jane Private Donor|super-secret-token-value|4242-4242/);
  } finally {
    audit.restore();
  }
});

test('MCP audit middleware logs metadata only for successful tool calls', async () => {
  const audit = captureAuditLogs();
  try {
    const { auditMiddleware } = require('../dist/audit/AuditMiddleware');
    const req = {
      body: {
        toolName: 'get-funder-research',
        params: {
          donorName: 'Alice Sensitive',
          accessToken: 'secret-token-123',
          paymentDetails: { card: '4111-1111-1111-1111' },
        },
      },
      headers: { 'x-request-id': 'req_success_privacy' },
      path: '/tools/execute',
      method: 'POST',
      userId: 'user_1',
      orgId: 'org_1',
    };
    const res = buildResponse();

    await new Promise(resolve => auditMiddleware(req, res, resolve));
    res.send({ ok: true });

    assert.equal(audit.toolCalls.length, 1);
    assert.equal(audit.toolResults.length, 1);
    assert.equal(audit.toolCalls[0].params, undefined);
    assert.deepEqual(audit.toolCalls[0].metadata, {
      toolName: 'get-funder-research',
      userId: 'user_1',
      orgId: 'org_1',
      requestId: 'req_success_privacy',
      route: '/tools/execute',
      method: 'POST',
      hasParameters: true,
      parameterCount: 3,
    });
    assert.doesNotMatch(JSON.stringify(audit), /Alice Sensitive|secret-token-123|4111-1111/);
  } finally {
    audit.restore();
  }
});

function captureAuditLogs() {
  const { AuditLogger } = require('../dist/audit/AuditLogger');
  const originalLogToolCall = AuditLogger.prototype.logToolCall;
  const originalLogToolResult = AuditLogger.prototype.logToolResult;
  const toolCalls = [];
  const toolResults = [];

  AuditLogger.prototype.logToolCall = async function (payload) {
    toolCalls.push(payload);
  };
  AuditLogger.prototype.logToolResult = async function (payload) {
    toolResults.push(payload);
  };

  return {
    toolCalls,
    toolResults,
    restore() {
      AuditLogger.prototype.logToolCall = originalLogToolCall;
      AuditLogger.prototype.logToolResult = originalLogToolResult;
    },
  };
}

function signToken() {
  return jwt.sign(
    {
      sub: 'worker_1',
      orgId: 'org_1',
      email: 'worker@example.test',
      roles: ['admin'],
      permissions: [],
      sessionId: 'session_1',
    },
    process.env.JWT_SECRET,
    {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      expiresIn: '15m',
    },
  );
}

function buildResponse() {
  const res = {
    statusCode: 200,
    json(body) {
      res.body = body;
      return res;
    },
    send(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

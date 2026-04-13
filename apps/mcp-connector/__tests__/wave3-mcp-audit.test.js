const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Load environment variables for testing if needed
process.env.JWT_SECRET = process.env.JWT_SECRET || 'a-very-long-test-secret-at-least-32-chars';
process.env.JWT_ISSUER = 'magnus-mcp-connector';
process.env.JWT_AUDIENCE = 'magnus-nonprofit-os';

const app = require('../dist/server').default;
let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  server.close();
});

const validToken = jwt.sign(
  {
    sub: 'user-123',
    orgId: 'org-123',
    email: 'test@example.com',
    roles: ['admin'],
    permissions: [],
    sessionId: 'session-123',
  },
  process.env.JWT_SECRET,
  {
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    expiresIn: '15m',
  }
);

test('Server: returns 401 for unauthorized access to /tools/execute', async () => {
  const res = await fetch(`${baseUrl}/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName: 'get-multi-org-profile', params: {} })
  });

  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.error, 'UNAUTHORIZED');
});

test('Server: returns 400 if toolName is missing', async () => {
  const res = await fetch(`${baseUrl}/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
    body: JSON.stringify({ params: {} })
  });

  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'Tool name required');
});

test('Server: returns 404 for unknown tool', async () => {
  const res = await fetch(`${baseUrl}/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
    body: JSON.stringify({ toolName: 'does-not-exist', params: {} })
  });

  const body = await res.json();
  assert.equal(res.status, 404);
  assert.equal(body.error, 'Tool does-not-exist not found');
});

test('Server: accepts valid token and attempts execution', async () => {
  const res = await fetch(`${baseUrl}/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
    body: JSON.stringify({ toolName: 'get-multi-org-profile', params: { include_comparison: false } })
  });
  
  // Clean up body stream
  await res.text();

  // It should result in a 500 error because there's no DB connected to run WorkerService,
  // OR a NOT_FOUND because no orgs exist. But NOT a 401 or 404.
  assert.ok(res.status !== 401 && res.status !== 404 && res.status !== 400, `Unexpected status: ${res.status}`);
});

test('Server: restricts unauthorized cross-org EIN access (dispatcher AuthZ)', async () => {
  const res = await fetch(`${baseUrl}/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
    body: JSON.stringify({ 
      toolName: 'get-revenue-breakdown', 
      params: { ein: 'cross-org-unauthorized-ein' } 
    })
  });
  
  const body = await res.json();
  // Since the user is mocked and no such org is registered in WorkerService, checkEINAuthorization will return false
  assert.equal(res.status, 403);
  assert.equal(body.error, 'FORBIDDEN_EIN');
});

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
// Directly requires the actual Express app handler
import app from '../dist/server.js';

// Setup Mock Environment
process.env.JWT_SECRET = 'wave-6-super-secure-production-ready-test-secret-32b';
process.env.JWT_ISSUER = 'magnus-mcp-connector';
process.env.JWT_AUDIENCE = 'magnus-nonprofit-os';

let server: any;
let baseUrl: string;

describe('Wave 6 E2E: MCP Real Auth', () => {

  before(async () => {
    // Starts the literal Express app instance to do real HTTP bound checks
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
  });

  test('E2E: Tool Execution strictly validates signature on Token', async () => {
    const invalidToken = jwt.sign({ sub: 'u-1', orgId: 'org-1' }, 'wrong-secret-key-1234');
    
    const res = await fetch(`${baseUrl}/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${invalidToken}`,
      },
      body: JSON.stringify({ toolName: 'get-multi-org-profile', params: {} }),
    });

    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.error, 'UNAUTHORIZED');
  });

  test('E2E: Authorized payload reaches WorkerService logic and fails safely (Not Found) without DB setup', async () => {
    const validToken = jwt.sign({ sub: 'u-1', orgId: 'org-1' }, process.env.JWT_SECRET as string, {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });

    const res = await fetch(`${baseUrl}/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ toolName: 'get-multi-org-profile', params: {} }),
    });

    const body = await res.json();
    // Since we're hitting a blank or invalid DB stub inside tests via prisma, 
    // we expect either a NOT_FOUND or Prisma error, but definitely not a 401.
    assert.ok(res.status !== 401 && res.status !== 403);
    
    // Explicit fail-closed reality behavior
    assert.equal(body.error, 'NOT_FOUND');
  });

  test('E2E: Blocks unrecognized tool executions gracefully', async () => {
    const validToken = jwt.sign({ sub: 'u-1', orgId: 'org-1' }, process.env.JWT_SECRET as string, {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });

    const res = await fetch(`${baseUrl}/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ toolName: 'fabricate-tax-return', params: {} }),
    });

    const body = await res.json();
    assert.equal(res.status, 404);
    assert.match(body.error, /not found/);
  });
});

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupIntegrationData, createOrganizationFixture } from './dbTestUtils';

const executeTool = vi.fn().mockResolvedValue(JSON.stringify({ ok: true }));

vi.mock('../../apps/mcp-connector/src/tools/registry', () => {
  const tool = {
    name: 'compliance',
    category: 'compliance',
    description: 'Compliance tool',
    schema: {
      parse: (input: unknown) => input,
    },
    execute: executeTool,
  };

  return {
    hasTool: vi.fn((name: string) => name === 'compliance'),
    getTool: vi.fn((name: string) => (name === 'compliance' ? tool : undefined)),
    getAllTools: vi.fn(() => [tool]),
  };
});

const { app } = await import('../../apps/mcp-connector/src/server');

const AUTH_ORG_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_ORG_EIN = '123456780';
const OTHER_ORG_EIN = '987654321';

function createMcpJwt(orgId = AUTH_ORG_ID): string {
  return jwt.sign(
    {
      sub: 'user-123',
      orgId,
      email: 'user@example.com',
      roles: ['admin'],
      permissions: ['tool:compliance'],
      sessionId: 'session-123',
    },
    process.env.JWT_SECRET!,
    {
      algorithm: 'HS256',
      issuer: 'magnus-mcp-connector',
      audience: 'magnus-nonprofit-os',
      expiresIn: '1h',
    }
  );
}

describe('mcp-connector integration', () => {
  beforeEach(async () => {
    await cleanupIntegrationData([AUTH_ORG_ID, OTHER_ORG_ID]);
    await createOrganizationFixture({
      id: AUTH_ORG_ID,
      ein: AUTH_ORG_EIN,
      name: 'Authorized Org',
    });
    await createOrganizationFixture({
      id: OTHER_ORG_ID,
      ein: OTHER_ORG_EIN,
      name: 'Other Org',
    });
  });

  afterEach(async () => {
    await cleanupIntegrationData([AUTH_ORG_ID, OTHER_ORG_ID]);
    vi.clearAllMocks();
  });

  it('POST /api/tools/compliance returns 401 without JWT', async () => {
    const response = await request(app)
      .post('/api/tools/compliance')
      .send({ input: { ein: AUTH_ORG_EIN } });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_REQUIRED');
  });

  it('POST /api/tools/compliance returns 403 for cross-org access', async () => {
    const response = await request(app)
      .post('/api/tools/compliance')
      .set('Authorization', `Bearer ${createMcpJwt(AUTH_ORG_ID)}`)
      .send({ input: { ein: OTHER_ORG_EIN } });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('POST /api/tools/compliance returns 200 with a valid JWT', async () => {
    const response = await request(app)
      .post('/api/tools/compliance')
      .set('Authorization', `Bearer ${createMcpJwt(AUTH_ORG_ID)}`)
      .send({ input: { ein: AUTH_ORG_EIN } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tool: 'compliance',
      result: { ok: true },
      executedBy: 'user-123',
    });
    expect(executeTool).toHaveBeenCalledWith({ ein: AUTH_ORG_EIN });
  });
});

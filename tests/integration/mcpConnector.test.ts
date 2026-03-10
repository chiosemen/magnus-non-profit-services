import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@magnus/subscription', () => {
  class FeatureNotEnabledError extends Error {
    featureKey?: string;
    code?: string;
  }

  class SubscriptionNotActiveError extends Error {
    code?: string;
  }

  return {
    enforceFeature: vi.fn().mockResolvedValue(undefined),
    FeatureNotEnabledError,
    SubscriptionNotActiveError,
  };
});

vi.mock('@magnus/db/client', () => {
  const prisma = {
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) => {
        if (where.id === 'org-123') {
          return {
            id: 'org-123',
            subscriptionTier: 'ENTERPRISE',
            subscriptionStatus: 'ACTIVE',
          };
        }

        return null;
      }),
    },
  };

  return {
    __esModule: true,
    default: prisma,
    prisma,
  };
});

vi.mock('@magnus/db', () => {
  const prisma = {
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { ein?: string } }) => {
        if (where.ein === '123456789') {
          return { id: 'org-123' };
        }
        if (where.ein === '987654321') {
          return { id: 'other-org' };
        }
        return null;
      }),
    },
    workerOrgRelationship: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    worker: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };

  return {
    __esModule: true,
    default: prisma,
    prisma,
  };
});

vi.mock('../../apps/mcp-connector/src/security/validateOrgOwnership', () => ({
  validateOrgOwnership: vi.fn(async (ein: string, orgId: string) => {
    if (ein === '987654321') {
      const { MagnusError } = await import('../../apps/mcp-connector/src/utils/errors');
      throw new MagnusError('Forbidden: EIN does not belong to authenticated organization', 'FORBIDDEN', 403);
    }
    if (ein !== '123456789' || orgId !== 'org-123') {
      const { MagnusError } = await import('../../apps/mcp-connector/src/utils/errors');
      throw new MagnusError('Organization with EIN not found', 'ORG_NOT_FOUND', 404);
    }
  }),
  validateWorkerAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../apps/mcp-connector/src/tools/registry', () => {
  const tool = {
    name: 'compliance',
    category: 'compliance',
    description: 'Compliance tool',
    schema: {
      parse: (input: unknown) => input,
    },
    execute: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
  };

  return {
    hasTool: vi.fn((name: string) => name === 'compliance'),
    getTool: vi.fn((name: string) => (name === 'compliance' ? tool : undefined)),
    getAllTools: vi.fn(() => [tool]),
  };
});

const { app } = await import('../../apps/mcp-connector/src/server');

function createMcpJwt(orgId = 'org-123'): string {
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/tools/compliance returns 401 without JWT', async () => {
    const response = await request(app)
      .post('/api/tools/compliance')
      .send({ input: { ein: '123456789' } });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_REQUIRED');
  });

  it('POST /api/tools/compliance returns 403 for cross-org access', async () => {
    const response = await request(app)
      .post('/api/tools/compliance')
      .set('Authorization', `Bearer ${createMcpJwt('org-123')}`)
      .send({ input: { ein: '987654321' } });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('POST /api/tools/compliance returns 200 with a valid JWT', async () => {
    const response = await request(app)
      .post('/api/tools/compliance')
      .set('Authorization', `Bearer ${createMcpJwt('org-123')}`)
      .send({ input: { ein: '123456789' } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tool: 'compliance',
      result: { ok: true },
      executedBy: 'user-123',
    });
  });
});
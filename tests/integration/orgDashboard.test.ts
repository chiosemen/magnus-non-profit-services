import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@magnus/subscription', () => {
  class FeatureNotEnabledError extends Error {
    featureKey?: string;
    code?: string;
  }

  class AuthRequiredError extends Error {
    code?: string;
  }

  class InvalidTokenError extends Error {
    code?: string;
  }

  class SubscriptionNotActiveError extends Error {
    code?: string;
  }

  return {
    requireFeature: () => (_req: unknown, _res: unknown, next: (err?: unknown) => void) => next(),
    FeatureNotEnabledError,
    AuthRequiredError,
    InvalidTokenError,
    SubscriptionNotActiveError,
  };
});

vi.mock('@magnus/db/client', () => {
  const prisma = {
    organization: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'org-123',
        ein: '123456789',
        name: 'Test Org',
        annualRevenue: null,
        fiscalYearEnd: null,
        subscriptionTier: 'ENTERPRISE',
        subscriptionStatus: 'ACTIVE',
        stripeAccountId: null,
        createdAt: new Date('2026-03-09T00:00:00.000Z'),
        updatedAt: new Date('2026-03-09T00:00:00.000Z'),
        _count: {
          complianceCalendar: 0,
          grants: 0,
          workerRelationships: 0,
          incomeTransactions: 0,
        },
      }),
    },
    complianceCalendar: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    grant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  return {
    __esModule: true,
    default: prisma,
    prisma,
  };
});

const { app } = await import('../../apps/org-dashboard-api/src/server');

function createDashboardJwt(): string {
  return jwt.sign(
    { orgId: 'org-123', role: 'user', sub: 'user-123' },
    process.env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('org-dashboard-api integration', () => {
  it('GET /api/org/overview returns 200 with a valid JWT', async () => {
    const response = await request(app)
      .get('/api/org/overview')
      .set('Authorization', `Bearer ${createDashboardJwt()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      organization: {
        id: 'org-123',
        name: 'Test Org',
      },
    });
  });
});
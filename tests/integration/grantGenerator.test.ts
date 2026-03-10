import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
        name: 'Test Org',
        ein: '123456789',
        subscriptionTier: 'GROWTH',
        subscriptionStatus: 'ACTIVE',
      }),
    },
    grantProposal: {
      create: vi.fn().mockResolvedValue({
        id: 'grant-123',
      }),
      update: vi.fn().mockResolvedValue({
        id: 'grant-123',
        status: 'COMPLETE',
        funderName: 'Test Foundation',
        programName: 'Community Program',
        requestedAmount: 50000,
        qualityScore: 95,
        sections: {
          executive_summary: {
            title: 'Executive Summary',
            content: 'Generated content',
            wordCount: 120,
            qualityScore: 95,
          },
        },
        generatedAt: new Date('2026-03-09T00:00:00.000Z'),
        createdAt: new Date('2026-03-09T00:00:00.000Z'),
      }),
    },
  };

  return {
    __esModule: true,
    default: prisma,
    prisma,
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Generated grant section content with enough detail to satisfy validation.' }],
        usage: { input_tokens: 12, output_tokens: 34 },
        model: 'test-model',
        stop_reason: 'end_turn',
      }),
    };
  },
}));

vi.mock('../../apps/grant-generator/services/ClaudeClient.ts', () => ({
  getClaudeClient: () => ({
    generate: vi.fn().mockResolvedValue({
      content: 'Generated grant section content with enough detail to satisfy validation.',
      inputTokens: 12,
      outputTokens: 34,
      model: 'test-model',
      stopReason: 'end_turn',
      latencyMs: 10,
    }),
  }),
}));

const validate = vi.fn().mockReturnValue({
  wordCount: 120,
  overallScore: 95,
});

vi.mock('../../apps/grant-generator/services/QualityValidator', () => ({
  QualityValidator: vi.fn().mockImplementation(() => ({
    validate,
  })),
}));

const { app } = await import('../../apps/grant-generator/src/index');

function createGrantJwt(): string {
  return jwt.sign(
    { orgId: 'org-123', role: 'user', sub: 'user-123' },
    process.env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('grant-generator integration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/grants/generate returns 401 without JWT', async () => {
    const response = await request(app)
      .post('/api/grants/generate')
      .send({
        funderName: 'Test Foundation',
        programName: 'Community Program',
        requestedAmount: 50000,
        projectDescription: 'This is a sufficiently detailed project description for integration testing only.',
        targetPopulation: 'Families in the service area',
        sections: ['executive_summary'],
      });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'AUTH_REQUIRED' });
  });

  it('POST /api/grants/generate returns 201 with a valid JWT', async () => {
    const response = await request(app)
      .post('/api/grants/generate')
      .set('Authorization', `Bearer ${createGrantJwt()}`)
      .send({
        funderName: 'Test Foundation',
        programName: 'Community Program',
        requestedAmount: 50000,
        projectDescription: 'This is a sufficiently detailed project description for integration testing only.',
        targetPopulation: 'Families in the service area',
        sections: ['executive_summary'],
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: 'grant-123',
      status: 'COMPLETE',
    });
  });
});
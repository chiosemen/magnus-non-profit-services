import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@magnus/db/client';
import { cleanupIntegrationData, createOrganizationFixture } from './dbTestUtils.ts';

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

const ORG_ID = '11111111-1111-4111-8111-111111111111';
// Use a suite-specific EIN to avoid cross-suite unique constraint collisions
// when multiple integration tests create organizations by different IDs.
const ORG_EIN = '123450003';

function createGrantJwt(): string {
  return jwt.sign(
    { orgId: ORG_ID, role: 'user', sub: 'user-123' },
    process.env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('grant-generator integration', () => {
  beforeEach(async () => {
    await cleanupIntegrationData([ORG_ID], { grantProposal: true });
    await createOrganizationFixture({
      id: ORG_ID,
      ein: ORG_EIN,
      name: 'Grant Test Org',
      subscriptionTier: 'GROWTH',
    });
  });

  afterEach(async () => {
    await cleanupIntegrationData([ORG_ID], { grantProposal: true });
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
      status: 'COMPLETE',
      funderName: 'Test Foundation',
    });

    const storedProposal = await prisma.grantProposal.findUnique({
      where: { id: response.body.id },
    });
    expect(storedProposal).not.toBeNull();
    expect(storedProposal?.orgId).toBe(ORG_ID);
    expect(storedProposal?.status).toBe('COMPLETE');
  });
});

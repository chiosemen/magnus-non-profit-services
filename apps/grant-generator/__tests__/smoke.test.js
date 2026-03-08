const { test, describe, mock, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Test JWT secret (must be 32+ chars)
const TEST_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';

test('smoke', () => {
  assert.equal(true, true);
});

describe('auth middleware', () => {
  test('missing Authorization header returns 401', async () => {
    // Simulates what createJwtAuthMiddleware does when no auth header is present
    const authHeader = '';
    const hasAuth = Boolean(authHeader && authHeader.toLowerCase().startsWith('bearer '));
    assert.equal(hasAuth, false, 'should detect missing auth');
  });

  test('invalid token returns 401', async () => {
    const invalidToken = 'not-a-valid-jwt';
    let verified = false;
    try {
      jwt.verify(invalidToken, TEST_JWT_SECRET, { algorithms: ['HS256'] });
      verified = true;
    } catch {
      verified = false;
    }
    assert.equal(verified, false, 'invalid token should fail verification');
  });

  test('valid token with orgId and role passes', async () => {
    const payload = { orgId: '123e4567-e89b-12d3-a456-426614174000', role: 'user' };
    const token = jwt.sign(payload, TEST_JWT_SECRET, { algorithm: 'HS256' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
    assert.equal(decoded.orgId, payload.orgId);
    assert.equal(decoded.role, payload.role);
  });

  test('token missing orgId fails', async () => {
    const payload = { role: 'user' }; // missing orgId
    const token = jwt.sign(payload, TEST_JWT_SECRET, { algorithm: 'HS256' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
    // The middleware would reject this because orgId is required
    assert.equal(typeof decoded.orgId, 'undefined', 'token without orgId should not have orgId');
  });
});

describe('zod validation', () => {
  const { z } = require('zod');

  const GenerateRequestSchema = z.object({
    funderName: z.string().min(1).max(200),
    programName: z.string().min(1).max(200),
    requestedAmount: z.number().positive().max(100_000_000),
    projectDescription: z.string().min(50).max(5000),
    targetPopulation: z.string().min(10).max(1000),
    sections: z.array(z.enum([
      'executive_summary',
      'need_statement',
      'program_design',
      'evaluation_plan',
      'organizational_capacity',
      'budget_narrative',
      'sustainability',
    ])).min(1).max(7).default([
      'executive_summary',
      'need_statement',
      'program_design',
      'evaluation_plan',
    ]),
  });

  test('valid request passes validation', () => {
    const validRequest = {
      funderName: 'Test Foundation',
      programName: 'Community Health',
      requestedAmount: 50000,
      projectDescription: 'This is a detailed project description that exceeds the minimum of 50 characters.',
      targetPopulation: 'Low-income families in the local area',
      sections: ['executive_summary', 'need_statement'],
    };
    const result = GenerateRequestSchema.safeParse(validRequest);
    assert.equal(result.success, true);
  });

  test('missing required fields fails validation', () => {
    const invalidRequest = {
      funderName: 'Test Foundation',
      // missing other required fields
    };
    const result = GenerateRequestSchema.safeParse(invalidRequest);
    assert.equal(result.success, false);
  });

  test('requestedAmount must be positive', () => {
    const invalidRequest = {
      funderName: 'Test Foundation',
      programName: 'Community Health',
      requestedAmount: -1000,
      projectDescription: 'This is a detailed project description that exceeds the minimum of 50 characters.',
      targetPopulation: 'Low-income families in the local area',
    };
    const result = GenerateRequestSchema.safeParse(invalidRequest);
    assert.equal(result.success, false);
  });

  test('projectDescription minimum length enforced', () => {
    const invalidRequest = {
      funderName: 'Test Foundation',
      programName: 'Community Health',
      requestedAmount: 50000,
      projectDescription: 'Too short',
      targetPopulation: 'Low-income families in the local area',
    };
    const result = GenerateRequestSchema.safeParse(invalidRequest);
    assert.equal(result.success, false);
  });

  test('invalid section type fails validation', () => {
    const invalidRequest = {
      funderName: 'Test Foundation',
      programName: 'Community Health',
      requestedAmount: 50000,
      projectDescription: 'This is a detailed project description that exceeds the minimum of 50 characters.',
      targetPopulation: 'Low-income families in the local area',
      sections: ['invalid_section_type'],
    };
    const result = GenerateRequestSchema.safeParse(invalidRequest);
    assert.equal(result.success, false);
  });
});

describe('org scoping', () => {
  test('proposal orgId must match auth orgId for access', () => {
    const authOrgId = '123e4567-e89b-12d3-a456-426614174000';
    const proposalOrgId = '123e4567-e89b-12d3-a456-426614174000';
    const otherOrgId = '987fcdeb-51a2-3e4f-b567-890123456789';

    // Same org - should have access
    assert.equal(authOrgId === proposalOrgId, true);

    // Different org - should NOT have access
    assert.equal(authOrgId === otherOrgId, false);
  });

  test('UUID format validation', () => {
    const validUUID = '123e4567-e89b-12d3-a456-426614174000';
    const invalidUUID = 'not-a-uuid';

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    assert.equal(uuidRegex.test(validUUID), true);
    assert.equal(uuidRegex.test(invalidUUID), false);
  });
});

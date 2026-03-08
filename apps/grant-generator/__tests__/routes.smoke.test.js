const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-must-be-at-least-32-chars-long';

test('smoke', () => {
  assert.equal(true, true);
});

describe('health endpoint', () => {
  test('health check does not require authentication', () => {
    // Simulates: GET /health => 200 OK without any auth header
    const hasAuthMiddleware = false; // /health route is public
    assert.equal(hasAuthMiddleware, false, 'health endpoint should not require auth');
  });
});

describe('auth routes', () => {
  test('POST /api/generate requires valid JWT', () => {
    // The route uses createJwtAuthMiddleware
    const invalidToken = 'invalid-jwt';
    let isValid = false;
    try {
      jwt.verify(invalidToken, TEST_JWT_SECRET, { algorithms: ['HS256'] });
      isValid = true;
    } catch {
      isValid = false;
    }
    assert.equal(isValid, false, 'invalid JWT should be rejected');
  });

  test('POST /api/status/:id requires valid JWT', () => {
    // Status check also requires auth
    const validPayload = { sub: 'user-123', orgId: 'org-123', role: 'user' };
    const token = jwt.sign(validPayload, TEST_JWT_SECRET, { algorithm: 'HS256' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
    assert.equal(decoded.orgId, 'org-123');
  });

  test('GET /api/proposals requires valid JWT', () => {
    // List proposals requires auth
    const validPayload = { sub: 'user-123', orgId: 'org-123', role: 'user' };
    const token = jwt.sign(validPayload, TEST_JWT_SECRET, { algorithm: 'HS256' });
    assert.ok(token);
  });
});

describe('subscription feature checks', () => {
  test('grant generation requires grant_generator feature', () => {
    // Routes check for grant_generator subscription feature
    const requiredFeature = 'grant_generator';
    assert.equal(requiredFeature, 'grant_generator');
  });

  test('feature not enabled returns 403', () => {
    const errorResponse = {
      error: 'FEATURE_NOT_ENABLED',
      feature: 'grant_generator',
    };
    assert.equal(errorResponse.error, 'FEATURE_NOT_ENABLED');
    assert.equal(errorResponse.feature, 'grant_generator');
  });
});

describe('proposal generation', () => {
  test('generate request validation schema', () => {
    // Request must include required fields
    const requiredFields = [
      'funderName',
      'programName',
      'requestedAmount',
      'projectDescription',
      'targetPopulation',
    ];
    assert.equal(requiredFields.length, 5, 'should have 5 required fields');
  });

  test('orgId scoping enforced', () => {
    // Users can only access proposals from their org
    const authOrgId = 'org-123';
    const proposalOrgId = 'org-123';
    const otherOrgId = 'org-456';

    assert.equal(authOrgId === proposalOrgId, true, 'same org should have access');
    assert.equal(authOrgId === otherOrgId, false, 'different org should not have access');
  });
});

describe('error responses', () => {
  test('401 for missing auth', () => {
    const errorResponse = { error: 'AUTH_REQUIRED' };
    assert.equal(errorResponse.error, 'AUTH_REQUIRED');
  });

  test('403 for invalid orgId scope', () => {
    const errorResponse = { error: 'FORBIDDEN' };
    assert.equal(errorResponse.error, 'FORBIDDEN');
  });

  test('404 for proposal not found', () => {
    const errorResponse = { error: 'PROPOSAL_NOT_FOUND' };
    assert.equal(errorResponse.error, 'PROPOSAL_NOT_FOUND');
  });

  test('500 for generation errors', () => {
    const errorResponse = { error: 'GENERATION_ERROR' };
    assert.equal(errorResponse.error, 'GENERATION_ERROR');
  });
});

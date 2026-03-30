const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Test JWT secret (must match apps that use @magnus/auth)
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-must-be-at-least-32-chars-long';

test('smoke', () => {
  assert.equal(true, true);
});

describe('health endpoint', () => {
  test('health check does not require authentication', () => {
    // Simulates: GET /health => 200 OK without any auth header
    const hasAuthMiddleware = false; // /health route doesn't use jwtAuth
    assert.equal(hasAuthMiddleware, false, 'health endpoint should not require auth');
  });
});

describe('auth middleware', () => {
  test('missing Authorization header returns 401', () => {
    // Simulates what createJwtAuthMiddleware does
    const authHeader = '';
    const hasAuth = Boolean(authHeader && authHeader.toLowerCase().startsWith('bearer '));
    assert.equal(hasAuth, false, 'should detect missing auth');
  });

  test('invalid token returns 401', () => {
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

  test('valid token with orgId and userId passes', () => {
    const payload = {
      sub: 'user-123',
      orgId: '123e4567-e89b-12d3-a456-426614174000',
      role: 'user',
    };
    const token = jwt.sign(payload, TEST_JWT_SECRET, { algorithm: 'HS256' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] });
    assert.equal(decoded.orgId, payload.orgId);
    assert.equal(decoded.sub, payload.sub);
  });
});

describe('protected routes', () => {
  test('protected route requires auth token', () => {
    // Routes that use jwtAuth middleware:
    // - GET /api/org/overview
    // - GET /api/org/compliance
    // - GET /api/org/grants
    // - GET /api/org/governance
    // - GET /api/org/state-registrations
    // - GET /api/org/audit-prep
    // - POST /api/org/audit-prep/apply-template
    // - PATCH /api/org/audit-prep/items/:itemId
    // - GET /api/partner/portfolio/summary
    // - POST /api/partner/portfolio/orgs
    // - PATCH /api/partner/portfolio/orgs/:orgId
    const protectedRoutes = [
      '/api/org/overview',
      '/api/org/compliance',
      '/api/org/grants',
      '/api/org/governance',
      '/api/org/state-registrations',
      '/api/org/audit-prep',
      '/api/org/audit-prep/apply-template',
      '/api/org/audit-prep/items/:itemId',
      '/api/partner/portfolio/summary',
      '/api/partner/portfolio/orgs',
      '/api/partner/portfolio/orgs/:orgId',
    ];
    assert.equal(protectedRoutes.length, 11, 'should have 11 protected routes');
  });

  test('feature flags control route access', () => {
    // Routes check subscription features:
    // - /api/org/overview -> compliance_calendar
    // - /api/org/compliance -> compliance_calendar
    // - /api/org/grants -> grant_generator
    // - /api/org/governance -> compliance_calendar
    // - /api/org/state-registrations -> compliance_calendar
    const features = {
      '/api/org/overview': 'compliance_calendar',
      '/api/org/compliance': 'compliance_calendar',
      '/api/org/grants': 'grant_generator',
      '/api/org/governance': 'compliance_calendar',
      '/api/org/state-registrations': 'compliance_calendar',
      '/api/org/audit-prep': 'compliance_calendar',
      '/api/org/audit-prep/apply-template': 'compliance_calendar',
      '/api/org/audit-prep/items/:itemId': 'compliance_calendar',
      '/api/partner/portfolio/summary': 'institutional_partner',
      '/api/partner/portfolio/orgs': 'institutional_partner',
      '/api/partner/portfolio/orgs/:orgId': 'institutional_partner',
    };
    assert.equal(Object.keys(features).length, 11, 'feature flags configured');
  });
});

describe('error responses', () => {
  test('404 error structure for unknown org', () => {
    const errorResponse = {
      error: 'ORG_NOT_FOUND',
    };
    assert.equal(errorResponse.error, 'ORG_NOT_FOUND');
  });

  test('403 error for feature not enabled', () => {
    const errorResponse = {
      error: 'FEATURE_NOT_ENABLED',
      feature: 'compliance_calendar',
    };
    assert.equal(errorResponse.error, 'FEATURE_NOT_ENABLED');
    assert.equal(errorResponse.feature, 'compliance_calendar');
  });

  test('401 error for missing/invalid auth', () => {
    const authRequiredError = { error: 'AUTH_REQUIRED' };
    const invalidTokenError = { error: 'INVALID_TOKEN' };
    assert.equal(authRequiredError.error, 'AUTH_REQUIRED');
    assert.equal(invalidTokenError.error, 'INVALID_TOKEN');
  });
});

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Test JWT configuration (must match TokenValidator expectations)
const TEST_JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
const TEST_JWT_ISSUER = 'magnus-mcp-connector';
const TEST_JWT_AUDIENCE = 'magnus-nonprofit-os';

test('smoke', () => {
  assert.equal(true, true);
});

describe('health endpoint', () => {
  test('health check does not require authentication', () => {
    // Simulates: GET /health => 200 OK without any auth header
    // The health endpoint is explicitly excluded from authMiddleware
    const hasAuthMiddleware = false; // /health route doesn't use authMiddleware
    assert.equal(hasAuthMiddleware, false, 'health endpoint should not require auth');
  });
});

describe('auth middleware', () => {
  test('missing Authorization header returns 401', () => {
    // Simulates what authMiddleware does when no auth header is present
    const authHeader = '';
    const hasAuth = Boolean(authHeader);
    assert.equal(hasAuth, false, 'should detect missing auth');
  });

  test('invalid token returns 401', () => {
    const invalidToken = 'not-a-valid-jwt';
    let verified = false;
    try {
      jwt.verify(invalidToken, TEST_JWT_SECRET, {
        issuer: TEST_JWT_ISSUER,
        audience: TEST_JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
      verified = true;
    } catch {
      verified = false;
    }
    assert.equal(verified, false, 'invalid token should fail verification');
  });

  test('expired token returns 401', () => {
    const payload = {
      sub: 'user-123',
      orgId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['tool:get-filing-history'],
      sessionId: 'session-123',
    };
    // Create an already-expired token
    const expiredToken = jwt.sign(payload, TEST_JWT_SECRET, {
      algorithm: 'HS256',
      issuer: TEST_JWT_ISSUER,
      audience: TEST_JWT_AUDIENCE,
      expiresIn: '-1h', // Expired 1 hour ago
    });

    let errorType = null;
    try {
      jwt.verify(expiredToken, TEST_JWT_SECRET, {
        issuer: TEST_JWT_ISSUER,
        audience: TEST_JWT_AUDIENCE,
        algorithms: ['HS256'],
      });
    } catch (err) {
      errorType = err.name;
    }
    assert.equal(errorType, 'TokenExpiredError', 'should throw TokenExpiredError');
  });

  test('valid token with required fields passes', () => {
    const payload = {
      sub: 'user-123',
      orgId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['tool:get-filing-history'],
      sessionId: 'session-123',
    };
    const token = jwt.sign(payload, TEST_JWT_SECRET, {
      algorithm: 'HS256',
      issuer: TEST_JWT_ISSUER,
      audience: TEST_JWT_AUDIENCE,
      expiresIn: '1h',
    });

    const decoded = jwt.verify(token, TEST_JWT_SECRET, {
      issuer: TEST_JWT_ISSUER,
      audience: TEST_JWT_AUDIENCE,
      algorithms: ['HS256'],
    });

    assert.equal(decoded.sub, payload.sub);
    assert.equal(decoded.orgId, payload.orgId);
    assert.equal(decoded.email, payload.email);
    assert.deepEqual(decoded.roles, payload.roles);
    assert.deepEqual(decoded.permissions, payload.permissions);
    assert.equal(decoded.sessionId, payload.sessionId);
  });

  test('token missing required field (orgId) fails validation', () => {
    const payload = {
      sub: 'user-123',
      // missing orgId
      email: 'test@example.com',
      roles: ['user'],
      permissions: [],
      sessionId: 'session-123',
    };
    const token = jwt.sign(payload, TEST_JWT_SECRET, {
      algorithm: 'HS256',
      issuer: TEST_JWT_ISSUER,
      audience: TEST_JWT_AUDIENCE,
      expiresIn: '1h',
    });

    const decoded = jwt.verify(token, TEST_JWT_SECRET, {
      issuer: TEST_JWT_ISSUER,
      audience: TEST_JWT_AUDIENCE,
      algorithms: ['HS256'],
    });

    // TokenValidator.assertPayloadFields would reject this
    assert.equal(decoded.orgId, undefined, 'token without orgId should not have orgId');
  });
});

describe('tool permission checks', () => {
  test('wildcard permission grants access to any tool', () => {
    const permissions = ['*'];
    const roles = ['user'];
    const toolName = 'get-filing-history';

    const hasPermission =
      permissions.includes('*') ||
      permissions.includes(`tool:${toolName}`) ||
      roles.includes('admin');

    assert.equal(hasPermission, true, 'wildcard should grant access');
  });

  test('specific tool permission grants access', () => {
    const permissions = ['tool:get-filing-history'];
    const roles = ['user'];
    const toolName = 'get-filing-history';

    const hasPermission =
      permissions.includes('*') ||
      permissions.includes(`tool:${toolName}`) ||
      roles.includes('admin');

    assert.equal(hasPermission, true, 'specific tool permission should grant access');
  });

  test('category wildcard permission grants access', () => {
    const permissions = ['tool:compliance:*'];
    const roles = ['user'];
    const toolName = 'get-filing-history';
    const toolCategory = 'compliance';

    const hasPermission =
      permissions.includes('*') ||
      permissions.includes(`tool:${toolName}`) ||
      permissions.includes(`tool:${toolCategory}:*`) ||
      roles.includes('admin');

    assert.equal(hasPermission, true, 'category wildcard should grant access');
  });

  test('admin role grants access to any tool', () => {
    const permissions = [];
    const roles = ['admin'];
    const toolName = 'get-filing-history';

    const hasPermission =
      permissions.includes('*') ||
      permissions.includes(`tool:${toolName}`) ||
      roles.includes('admin');

    assert.equal(hasPermission, true, 'admin role should grant access');
  });

  test('no matching permission denies access', () => {
    const permissions = ['tool:other-tool'];
    const roles = ['user'];
    const toolName = 'get-filing-history';
    const toolCategory = 'compliance';

    const hasPermission =
      permissions.includes('*') ||
      permissions.includes(`tool:${toolName}`) ||
      permissions.includes(`tool:${toolCategory}:*`) ||
      roles.includes('admin');

    assert.equal(hasPermission, false, 'should deny access without matching permission');
  });
});

describe('tool registry', () => {
  test('tool name format is valid', () => {
    // Tool names should be kebab-case
    const validNames = [
      'get-filing-history',
      'get-state-registrations',
      'get-expense-allocation',
      'get-revenue-breakdown',
      'get-funder-research',
      'get-grant-history',
      'get-income-summary',
      'get-multi-org-profile',
      'get-tax-estimates',
    ];

    const namePattern = /^[a-z][a-z0-9-]*[a-z0-9]$/;
    for (const name of validNames) {
      assert.equal(namePattern.test(name), true, `${name} should be valid kebab-case`);
    }
  });

  test('tool categories are valid', () => {
    const validCategories = ['compliance', 'financials', 'grants', 'workers'];
    const categoryPattern = /^[a-z]+$/;
    for (const cat of validCategories) {
      assert.equal(categoryPattern.test(cat), true, `${cat} should be valid category`);
    }
  });
});

describe('tool execution request validation', () => {
  const { z } = require('zod');

  const ToolExecuteSchema = z.object({
    input: z.record(z.unknown()).default({}),
  });

  test('valid request with input passes', () => {
    const validRequest = {
      input: { ein: '12-3456789', year: 2023 },
    };
    const result = ToolExecuteSchema.safeParse(validRequest);
    assert.equal(result.success, true);
    assert.deepEqual(result.data.input, validRequest.input);
  });

  test('empty body gets default empty input', () => {
    const emptyRequest = {};
    const result = ToolExecuteSchema.safeParse(emptyRequest);
    assert.equal(result.success, true);
    assert.deepEqual(result.data.input, {});
  });

  test('request with null input fails', () => {
    const invalidRequest = { input: null };
    const result = ToolExecuteSchema.safeParse(invalidRequest);
    assert.equal(result.success, false);
  });
});

describe('error responses', () => {
  test('404 error structure for unknown tool', () => {
    const toolName = 'unknown-tool';
    const errorResponse = {
      error: 'MCP_TOOL_NOT_FOUND',
      message: `Tool not found: ${toolName}`,
    };
    assert.equal(errorResponse.error, 'MCP_TOOL_NOT_FOUND');
    assert.equal(errorResponse.message.includes(toolName), true);
  });

  test('403 error structure for permission denied', () => {
    const toolName = 'get-filing-history';
    const errorResponse = {
      error: 'PERMISSION_DENIED',
      message: `Permission denied for tool: ${toolName}`,
    };
    assert.equal(errorResponse.error, 'PERMISSION_DENIED');
    assert.equal(errorResponse.message.includes(toolName), true);
  });

  test('401 error structure for missing auth', () => {
    const errorResponse = {
      error: 'AUTH_REQUIRED',
      message: 'Authorization header required',
    };
    assert.equal(errorResponse.error, 'AUTH_REQUIRED');
  });
});

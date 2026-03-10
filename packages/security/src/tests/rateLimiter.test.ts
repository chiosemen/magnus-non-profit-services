import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLoginBlocked,
  recordLoginFailure,
  clearLoginFailures,
  consumeRefreshAttempt,
} from '../rateLimiter';

// ── recordLoginFailure / isLoginBlocked ────────────────────────────────────────

test('loginLimiter: 5 failed attempts are all within budget', async () => {
  const ip = `login-under-${Date.now()}-${Math.random()}`;

  for (let i = 0; i < 5; i++) {
    const result = await recordLoginFailure(ip);
    assert.equal(result.limited, false, `attempt ${i + 1} should not be rate-limited`);
  }

  // After 5 failures the IP is blocked — isLoginBlocked should detect it
  const blocked = await isLoginBlocked(ip);
  assert.equal(blocked.limited, true, 'IP should be blocked after 5 failures');
});

test('loginLimiter: 6th failed attempt is rate-limited (HTTP 429 scenario)', async () => {
  const ip = `login-block-${Date.now()}-${Math.random()}`;

  for (let i = 0; i < 5; i++) {
    await recordLoginFailure(ip);
  }

  const result = await recordLoginFailure(ip);
  assert.equal(result.limited, true, '6th failure should return limited: true');
  assert.ok(
    result.limited && result.retryAfterSec > 0,
    'retryAfterSec should be a positive number',
  );
});

test('loginLimiter: successful login resets the failure counter', async () => {
  const ip = `login-reset-${Date.now()}-${Math.random()}`;

  // Record 3 failures
  for (let i = 0; i < 3; i++) {
    await recordLoginFailure(ip);
  }

  // Simulate successful login
  await clearLoginFailures(ip);

  // IP should no longer be blocked — fresh budget
  const blocked = await isLoginBlocked(ip);
  assert.equal(blocked.limited, false, 'IP should not be blocked after reset');

  // First failure after reset must not be blocked either
  const result = await recordLoginFailure(ip);
  assert.equal(result.limited, false, 'first failure after reset should not be rate-limited');

  // cleanup
  await clearLoginFailures(ip);
});

// ── consumeRefreshAttempt ──────────────────────────────────────────────────────

test('refreshLimiter: 10 attempts succeed, 11th is rate-limited (HTTP 429 scenario)', async () => {
  const ip = `refresh-${Date.now()}-${Math.random()}`;

  for (let i = 0; i < 10; i++) {
    const result = await consumeRefreshAttempt(ip);
    assert.equal(result.limited, false, `refresh attempt ${i + 1} should not be rate-limited`);
  }

  const result = await consumeRefreshAttempt(ip);
  assert.equal(result.limited, true, '11th refresh attempt should be rate-limited (HTTP 429)');
  assert.ok(
    result.limited && result.retryAfterSec > 0,
    'retryAfterSec should be a positive number',
  );
});


import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../envValidator';

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(overrides)) {
    prev[k] = process.env[k];
    const next = overrides[k];
    if (next === undefined) delete process.env[k];
    else process.env[k] = next;
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(overrides)) {
      const v = prev[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('validateEnv fails closed when JWT_SECRET missing (worker-financial-layer)', () => {
  withEnv({ DATABASE_URL: 'postgres://localhost/db', JWT_SECRET: undefined }, () => {
    assert.throws(() => validateEnv('worker-financial-layer'), /JWT_SECRET/);
  });
});

test('validateEnv does not require JWT_SECRET for agents', () => {
  withEnv({ DATABASE_URL: 'postgres://localhost/db', JWT_SECRET: undefined }, () => {
    assert.doesNotThrow(() => validateEnv('agents'));
  });
});

test('validateEnv requires STRIPE_SECRET_KEY for billing', () => {
  withEnv(
    { DATABASE_URL: 'postgres://localhost/db', JWT_SECRET: 'x'.repeat(32), STRIPE_SECRET_KEY: undefined },
    () => {
      assert.throws(() => validateEnv('billing'), /STRIPE_SECRET_KEY/);
    },
  );
});

test('validateEnv requires ANTHROPIC_API_KEY for claude-partner', () => {
  withEnv(
    { DATABASE_URL: 'postgres://localhost/db', JWT_SECRET: 'x'.repeat(32), ANTHROPIC_API_KEY: undefined },
    () => {
      assert.throws(() => validateEnv('claude-partner'), /ANTHROPIC_API_KEY/);
    },
  );
});

test('validateEnv requires ANTHROPIC_API_KEY for grant-generator', () => {
  withEnv(
    { DATABASE_URL: 'postgres://localhost/db', ANTHROPIC_API_KEY: undefined },
    () => {
      assert.throws(() => validateEnv('grant-generator'), /ANTHROPIC_API_KEY/);
    },
  );
});

test('validateEnv requires JWT_SECRET for mcp-connector', () => {
  withEnv(
    { DATABASE_URL: 'postgres://localhost/db', JWT_SECRET: undefined },
    () => {
      assert.throws(() => validateEnv('mcp-connector'), /JWT_SECRET/);
    },
  );
});

test('validateEnv requires Stripe Connect vars for org-dashboard-api', () => {
  withEnv(
    {
      DATABASE_URL: 'postgres://localhost/db',
      JWT_SECRET: 'x'.repeat(32),
      STRIPE_SECRET_KEY: undefined,
      STRIPE_CONNECT_RETURN_URL: undefined,
      STRIPE_CONNECT_REFRESH_URL: undefined,
    },
    () => {
      assert.throws(
        () => validateEnv('org-dashboard-api'),
        /STRIPE_SECRET_KEY|STRIPE_CONNECT_RETURN_URL|STRIPE_CONNECT_REFRESH_URL/,
      );
    },
  );
});


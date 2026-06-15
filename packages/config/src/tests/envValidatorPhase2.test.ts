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

test('validateEnv: allows missing Stripe keys in development for org-dashboard-api', () => {
  withEnv(
    {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://localhost/db',
      JWT_SECRET: 'x'.repeat(32),
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      STRIPE_CONNECT_RETURN_URL: 'https://example.com/stripe/return',
      STRIPE_CONNECT_REFRESH_URL: 'https://example.com/stripe/refresh',
    },
    () => {
      assert.doesNotThrow(() => validateEnv('org-dashboard-api'));
    }
  );
});

test('validateEnv: fails closed in production for org-dashboard-api if Stripe keys or URLs are missing', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://localhost/db',
      JWT_SECRET: 'x'.repeat(32),
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test',
      NEXT_PUBLIC_APP_URL: 'https://example.com',
      REDIS_URL: 'redis://localhost:6379',
      STRIPE_CONNECT_RETURN_URL: 'https://example.com/stripe/return',
      STRIPE_CONNECT_REFRESH_URL: 'https://example.com/stripe/refresh',
    },
    () => {
      assert.throws(() => validateEnv('org-dashboard-api'), /STRIPE_SECRET_KEY/);
    }
  );

  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://localhost/db',
      JWT_SECRET: 'x'.repeat(32),
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: undefined,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test',
      NEXT_PUBLIC_APP_URL: 'https://example.com',
    },
    () => {
      assert.throws(() => validateEnv('org-dashboard-api'), /STRIPE_WEBHOOK_SECRET/);
    }
  );

  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://localhost/db',
      JWT_SECRET: 'x'.repeat(32),
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
      NEXT_PUBLIC_APP_URL: 'https://example.com',
    },
    () => {
      assert.throws(() => validateEnv('org-dashboard-api'), /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
    }
  );

  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://localhost/db',
      JWT_SECRET: 'x'.repeat(32),
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test',
      NEXT_PUBLIC_APP_URL: undefined,
    },
    () => {
      assert.throws(() => validateEnv('org-dashboard-api'), /NEXT_PUBLIC_APP_URL/);
    }
  );
});

test('validateEnv: passes in production for org-dashboard-api if all Stripe keys and URLs are present', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://localhost/db',
      JWT_SECRET: 'x'.repeat(32),
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test',
      NEXT_PUBLIC_APP_URL: 'https://example.com',
      REDIS_URL: 'redis://localhost:6379',
      STRIPE_CONNECT_RETURN_URL: 'https://example.com/stripe/return',
      STRIPE_CONNECT_REFRESH_URL: 'https://example.com/stripe/refresh',
    },
    () => {
      assert.doesNotThrow(() => validateEnv('org-dashboard-api'));
    }
  );
});

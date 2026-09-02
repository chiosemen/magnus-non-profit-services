/**
 * PS-3 · PS-4 — the marketing deployment holds no application credentials.
 *
 * Spec: docs/security/PUBLIC-SURFACE-SEPARATION.md · SPEC-P0 R14.
 *
 * Threat (T4/T5 in the spec): a marketing service that carries DATABASE_URL can
 * reach the database whether or not any route is routable — the route gate is
 * then the only thing between the public internet and a live credential. The
 * release record (7430ad0 §7) already found a plaintext DATABASE_URL pasted
 * into `accord-web-staging`; a second service is a second chance to repeat it.
 *
 * Absence of the credential is the PRIMARY control. This is the test that
 * makes it one.
 *
 * R12: run against the pre-change tree and observed red (the exports under
 * test did not exist) before the implementation was written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMarketingOnlyEnvironment, isMarketingOnlyEnv, requireEnvForService } from '../env';

const FORBIDDEN = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'STRIPE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'SMTP_PASS',
] as const;

const CREDENTIAL_VALUE: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/accord',
  DATABASE_URL_UNPOOLED: 'postgresql://user:pass@db.internal:5432/accord',
  JWT_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY: 'a'.repeat(64),
  // Deliberately not shaped like any provider's real key format — these are
  // presence markers for a validator, and a fixture that looks like a
  // credential is a credential as far as a secret scanner is concerned.
  STRIPE_SECRET_KEY: 'stripe-secret-presence-marker',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase-service-role-presence-marker',
  ANTHROPIC_API_KEY: 'anthropic-key-presence-marker',
  SMTP_PASS: 'smtp-pass-presence-marker',
};

const MARKETING_BASE = { MARKETING_ONLY: 'true', NODE_ENV: 'production' } as const;

// ── PS-3 — each forbidden credential is rejected on its own ─────────────────

for (const key of FORBIDDEN) {
  test(`PS-3: marketing mode refuses to boot with ${key} present`, () => {
    const env = { ...MARKETING_BASE, [key]: CREDENTIAL_VALUE[key] } as NodeJS.ProcessEnv;
    assert.throws(
      () => assertMarketingOnlyEnvironment(env),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(
          error.message,
          new RegExp(key),
          `the failure must name ${key} so the operator knows which variable to remove`
        );
        return true;
      },
      `${key} in a marketing environment must fail closed`
    );
  });
}

test('PS-3: the forbidden set is derived from the schema, not hand-maintained', () => {
  // A credential added to serverEnvSchema later must be refused here by
  // default. These are declared variables the explicit list above never named.
  for (const key of [
    'CLERK_SECRET_KEY',
    'CLERK_WEBHOOK_SECRET',
    'STRIPE_WEBHOOK_SECRET',
    'AWS_SECRET_ACCESS_KEY',
    'SENTRY_AUTH_TOKEN',
    'MCP_SERVER_SECRET',
    'PLAID_SECRET',
    'SENDGRID_API_KEY',
    'RESEND_API_KEY',
    'CANDID_API_KEY',
  ]) {
    assert.throws(
      () => assertMarketingOnlyEnvironment({ ...MARKETING_BASE, [key]: 'placeholder' } as NodeJS.ProcessEnv),
      new RegExp(key),
      `${key} must be refused in a marketing environment without being listed by hand`
    );
  }
});

test('PS-3: the variables a static marketing page legitimately needs are permitted', () => {
  assert.doesNotThrow(() =>
    assertMarketingOnlyEnvironment({
      MARKETING_ONLY: 'true',
      NODE_ENV: 'production',
      PORT: '3000',
      LOG_LEVEL: 'info',
      NEXT_PUBLIC_APP_URL: 'https://magnusnonprofitservices.com',
      // platform-injected variables are out of scope and must not trip the check
      PATH: '/usr/bin',
      HOME: '/app',
      RAILWAY_ENVIRONMENT: 'production',
    } as NodeJS.ProcessEnv)
  );
});

test('PS-3: the same rejection applies through requireEnvForService("web")', () => {
  assert.throws(
    () =>
      requireEnvForService('web', {
        ...MARKETING_BASE,
        DATABASE_URL: CREDENTIAL_VALUE.DATABASE_URL,
      } as NodeJS.ProcessEnv),
    /DATABASE_URL/,
    'service validation must enforce the same rule as the standalone assertion'
  );
});

test('PS-3: a clean marketing environment boots', () => {
  assert.doesNotThrow(() => assertMarketingOnlyEnvironment({ ...MARKETING_BASE } as NodeJS.ProcessEnv));
  assert.doesNotThrow(() =>
    requireEnvForService('web', {
      ...MARKETING_BASE,
      NEXT_PUBLIC_APP_URL: 'https://magnusnonprofitservices.com',
    } as NodeJS.ProcessEnv)
  );
});

test('PS-3: REDIS_URL is not required in marketing mode — there is nothing to rate limit', () => {
  // The production Redis requirement exists for the auth and API surface. In
  // marketing mode that surface returns 404, so requiring Redis would only
  // push the operator to attach an unnecessary service.
  assert.doesNotThrow(() =>
    requireEnvForService('web', { ...MARKETING_BASE, REDIS_URL: undefined } as NodeJS.ProcessEnv)
  );
});

test('PS-3: an empty-string value is absence, not a credential', () => {
  // Railway and Vercel both surface unset variables as empty strings.
  assert.doesNotThrow(() =>
    assertMarketingOnlyEnvironment({ ...MARKETING_BASE, DATABASE_URL: '', JWT_SECRET: '   ' } as NodeJS.ProcessEnv)
  );
});

// ── PS-4 — the mode fails closed ────────────────────────────────────────────

test('PS-4: a malformed MARKETING_ONLY value fails the boot rather than defaulting', () => {
  for (const malformed of ['yes', '1', 'TRUE', 'True', 'on', 'enabled', 'no']) {
    assert.throws(
      () => assertMarketingOnlyEnvironment({ MARKETING_ONLY: malformed } as NodeJS.ProcessEnv),
      /MARKETING_ONLY/,
      `${malformed} must not boot — silently defaulting to application mode ` +
        'would serve /login and /api on the public apex (T5)'
    );
  }
});

test('PS-4: exactly "true" and "false" are accepted', () => {
  assert.equal(isMarketingOnlyEnv({ MARKETING_ONLY: 'true' } as NodeJS.ProcessEnv), true);
  assert.equal(isMarketingOnlyEnv({ MARKETING_ONLY: 'false' } as NodeJS.ProcessEnv), false);
  assert.equal(isMarketingOnlyEnv({} as NodeJS.ProcessEnv), false, 'absent means application mode');
});

// ── PS-6 — the application path is unchanged ────────────────────────────────

test('PS-6: outside marketing mode the existing web rules are untouched', () => {
  // Production web without Redis still fails, exactly as before this change.
  assert.throws(
    () =>
      requireEnvForService('web', {
        NODE_ENV: 'production',
        DATABASE_URL: CREDENTIAL_VALUE.DATABASE_URL,
        JWT_SECRET: CREDENTIAL_VALUE.JWT_SECRET,
      } as NodeJS.ProcessEnv),
    /REDIS_URL/,
    'the production Redis requirement must survive for the application deployment'
  );
  // And a fully configured application environment still validates.
  assert.doesNotThrow(() =>
    requireEnvForService('web', {
      NODE_ENV: 'production',
      DATABASE_URL: CREDENTIAL_VALUE.DATABASE_URL,
      JWT_SECRET: CREDENTIAL_VALUE.JWT_SECRET,
      REDIS_URL: 'redis://redis.internal:6379',
    } as NodeJS.ProcessEnv)
  );
});

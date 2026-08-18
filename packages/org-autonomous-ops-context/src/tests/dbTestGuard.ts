/**
 * Shared guard for database integration tests (P0-3, SPEC-P0 R2/R3).
 *
 * R3 — never let a test path touch a real database: assertSafeTestDatabaseUrl
 * must be called BEFORE any connection attempt. Only loopback hosts are
 * accepted (plus an explicit TEST_DB_ALLOWED_HOSTS opt-in for bespoke CI
 * runners); managed-database provider hosts and anything mentioning "prod"
 * are rejected outright. These tests INSERT rows — pointing them at
 * production must be a hard error, never a quiet run or a quiet skip.
 *
 * R2 — no vacuous green: when REQUIRE_DB_TESTS=1 (set in CI, where an
 * ephemeral Postgres 16 service is provisioned), an unreachable database
 * registers a FAILING test instead of a skip, so CI cannot pass with the
 * integration suites silently skipped.
 */
import test from 'node:test';

export function dbTestsRequired(): boolean {
  return process.env.REQUIRE_DB_TESTS === '1';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const FORBIDDEN_HOST_FRAGMENTS = [
  'neon.tech',
  'amazonaws.com',
  'rds.amazonaws',
  'azure.com',
  'database.windows.net',
  'render.com',
  'herokuapp.com',
  'heroku.com',
  'supabase.co',
  'supabase.com',
  'digitalocean.com',
  'ondigitalocean.app',
  'gcp.',
  'googleapis.com',
  'cockroachlabs.cloud',
  'psdb.cloud',
  'planetscale',
];

export function assertSafeTestDatabaseUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      'R3 guard: DATABASE_URL is not a parseable URL; refusing to run database integration tests against it.'
    );
  }

  const host = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();

  const forbidden = FORBIDDEN_HOST_FRAGMENTS.find((f) => host.includes(f));
  if (forbidden) {
    throw new Error(
      `R3 guard: DATABASE_URL host "${host}" matches managed-database provider "${forbidden}". ` +
        'Database integration tests mutate data and must only run against an ephemeral test database.'
    );
  }
  if (host.includes('prod') || dbName.includes('prod')) {
    throw new Error(
      `R3 guard: DATABASE_URL ("${host}/${dbName}") mentions "prod". Refusing to run tests against it.`
    );
  }

  const extraAllowed = (process.env.TEST_DB_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (!LOOPBACK_HOSTS.has(host) && !extraAllowed.includes(host)) {
    throw new Error(
      `R3 guard: DATABASE_URL host "${host}" is not a loopback host. Integration tests only run ` +
        'against an ephemeral local/CI database (or a host explicitly listed in TEST_DB_ALLOWED_HOSTS).'
    );
  }
}

/**
 * Register the outcome for a suite whose database is unreachable.
 * Local development without a database: visible skip (unchanged behavior).
 * CI (REQUIRE_DB_TESTS=1): failing test — the suite was required to run.
 */
export function registerDbUnavailable(label: string, reason: string): void {
  if (dbTestsRequired()) {
    test(`REQUIRED: ${label}`, () => {
      throw new Error(
        `REQUIRE_DB_TESTS=1 but this suite could not run: ${reason}. ` +
          'The CI Postgres service must be up and migrations applied before tests.'
      );
    });
  } else {
    test(`SKIP: ${label}`, { skip: reason }, () => {});
  }
}

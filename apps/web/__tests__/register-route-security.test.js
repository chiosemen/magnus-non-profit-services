/**
 * P0-7 regression — /api/auth/register must not be a write primitive.
 *
 * The register route is a Next.js route handler that imports prisma,
 * next/headers and bcrypt at module scope, so it cannot be invoked in a plain
 * node:test process without a running Next runtime and a database. These are
 * therefore SOURCE guards: they assert the defective constructs cannot return.
 *
 * Being explicit about what this does and does not prove (SPEC-P0 R2):
 * - It DOES catch reintroduction of upsert-on-identity, the hardcoded admin
 *   role, and the missing rate limit — the three constructs that made this
 *   endpoint exploitable.
 * - It does NOT execute the handler, so it is not proof of runtime behaviour.
 *   The behavioural half lives in the database test asserting the PENDING
 *   default, which runs against the ephemeral Postgres in CI.
 *
 * Every assertion below was verified to FAIL against the pre-fix route at
 * df0d5aa, which contained all four defects.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTE = path.join(__dirname, '..', 'src', 'app', 'api', 'auth', 'register', 'route.ts');
const src = fs.readFileSync(ROUTE, 'utf8');

// Strip comments so the guards match real code, not the explanatory prose
// above them (the migration validator's own false positive taught this).
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

test('register never upserts on an identity field (no account or org takeover)', () => {
  assert.ok(
    !/\bupsert\s*\(/.test(code),
    'upsert on email overwrote an existing passwordHash (account takeover); ' +
      'upsert on ein returned and renamed an existing org (tenant takeover). ' +
      'Registration must create new records only.'
  );
});

test('register does not overwrite passwordHash on an existing account', () => {
  // NOTE: the first version of this guard used
  //   /update:\s*\{[^}]*passwordHash/s
  // which is VACUOUS: [^}] stops at the first closing brace, and the real
  // defect was `update: { ...(name ? { name } : {}), passwordHash }` — the
  // nested `{ name }` supplies that brace, so the pattern never matched the
  // very code it was written to catch. Verified: it returned "ok" against
  // df0d5aa. Create-only registration has no `update:` clause at all, so
  // assert that directly — a guard that cannot be defeated by nesting.
  assert.ok(
    !/\bupdate\s*:/.test(code),
    'registration is create-only; any update: clause can overwrite an ' +
      'existing row (passwordHash overwrite was the takeover primitive)'
  );
});

test('register does not mint an admin role', () => {
  assert.ok(
    !/role:\s*'admin'/.test(code),
    "self-registration must not sign role: 'admin'"
  );
  assert.ok(
    /SELF_REGISTRATION_ROLE/.test(code),
    'the signed role must come from the least-privilege constant'
  );
});

test('register is rate limited like login', () => {
  assert.ok(/checkRateLimit\s*\(/.test(code), 'must call checkRateLimit');
  assert.ok(
    /rateCheck\.limited/.test(code),
    'must actually branch on the limit result, not just call the checker'
  );
  assert.ok(
    /recordFailure\s*\(/.test(code),
    'refused registrations must count toward the limit so collision probing is throttled'
  );
});

test('register does not hardcode an entitled subscription status', () => {
  assert.ok(
    !/subscriptionStatus:\s*'ACTIVE'/.test(code),
    'a self-registered org must not be created ACTIVE; the column default is PENDING'
  );
});

test('email and EIN conflicts return an identical response (no enumeration oracle)', () => {
  const matches = code.match(/registrationConflictResponse\s*\(\s*\)/g) ?? [];
  // One definition site plus at least two call sites (checked collision and
  // the concurrent-insert race).
  assert.ok(
    matches.length >= 3,
    `both conflict paths must return the same helper; found ${matches.length} references`
  );
  assert.ok(
    !/EMAIL_(TAKEN|EXISTS)|EIN_(TAKEN|EXISTS)|ORG_EXISTS/.test(code),
    'no error code may reveal WHICH identifier collided'
  );
});

test('a concurrent unique-constraint race is handled as a conflict, not a 500', () => {
  assert.ok(/P2002/.test(code), 'must map the Prisma unique-constraint code');
});

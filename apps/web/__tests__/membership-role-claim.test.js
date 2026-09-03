/**
 * MR-2 · MR-3 · MR-4 · MR-7 — the role claim is derived from the membership,
 * never written as a literal; only active memberships authenticate.
 *
 * Spec: docs/security/MEMBERSHIP-ROLES.md. Closes docs/releases/7430ad0.md §7
 * ("role: 'admin' hardcoded in login:96 and refresh:71").
 *
 * Threat (stated per SPEC-P0 §0): every login and every refresh minted
 * `role: 'admin'` as a string literal. The claim was decorative while every
 * user was the sole member of an org they created; the design-partner beta
 * ends that. A colleague invited into an org would be admin by construction
 * (T1), a demoted member would be re-minted admin on every refresh (T2), and
 * — found on the same path — a worker whose membership has ended could still
 * log in, refresh, and pass the SSR guard (T3).
 *
 * The decision logic lives in src/lib/auth/roles.js (plain CommonJS) for the
 * same reason public-surface.js does: this suite runs `node --test` with no
 * TypeScript step, and it must exercise the real predicate the routes use.
 *
 * R12: run against the pre-change tree and observed red (module absent,
 * literals present) before the implementation was written.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.join(__dirname, '..');
const rolesPath = path.join(webRoot, 'src', 'lib', 'auth', 'roles.js');
const read = (...p) => fs.readFileSync(path.join(webRoot, ...p), 'utf8');

/** Assertions about what code DOES read code, not prose. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function requireRoles() {
  assert.ok(
    fs.existsSync(rolesPath),
    `missing ${rolesPath} — role decisions must live in one runnable module shared by the routes and this test`
  );
  return require(rolesPath);
}

// ── MR-4 — closed set at the trust boundary ─────────────────────────────────

test('MR-4: the token role set is exactly admin and member', () => {
  const { TOKEN_ROLES, isTokenRole } = requireRoles();
  assert.deepEqual([...TOKEN_ROLES].sort(), ['admin', 'member']);
  assert.equal(isTokenRole('admin'), true);
  assert.equal(isTokenRole('member'), true);
  for (const bad of ['Admin', 'ADMIN', ' admin', 'admin ', '', 'owner', 'superuser', 'root', null, undefined, 1, {}]) {
    assert.equal(isTokenRole(bad), false, `${JSON.stringify(bad)} must not be a token role`);
  }
});

test('MR-4: the database enum maps to the token role in exactly one place', () => {
  const { toTokenRole } = requireRoles();
  assert.equal(toTokenRole('ADMIN'), 'admin');
  assert.equal(toTokenRole('MEMBER'), 'member');
  for (const bad of ['OWNER', 'admin', 'Admin', '', null, undefined]) {
    assert.throws(
      () => toTokenRole(bad),
      /unknown membership role/i,
      `${JSON.stringify(bad)} must throw — an unmapped enum value must never become a token silently`
    );
  }
});

test('MR-4: verifyAppToken rejects a role outside the closed set', () => {
  const src = stripComments(read('src', 'lib', 'auth.ts'));
  assert.match(src, /isTokenRole\(/, 'verifyAppToken must validate role with isTokenRole');
  assert.doesNotMatch(
    src,
    /typeof p\.role !== 'string' \|\|/,
    'a bare string check accepts any non-empty role — the closed set must be enforced'
  );
});

// ── MR-3 — only active memberships authenticate ─────────────────────────────

test('MR-3: isMembershipActive — no endDate, or a future one, is active', () => {
  const { isMembershipActive } = requireRoles();
  const now = new Date('2026-09-02T12:00:00Z');
  assert.equal(isMembershipActive({ endDate: null }, now), true);
  assert.equal(isMembershipActive({ endDate: undefined }, now), true);
  assert.equal(isMembershipActive({ endDate: new Date('2026-12-31T00:00:00Z') }, now), true);
});

test('MR-3: isMembershipActive — an ended membership is not active, inclusive of the boundary', () => {
  const { isMembershipActive } = requireRoles();
  const now = new Date('2026-09-02T12:00:00Z');
  assert.equal(isMembershipActive({ endDate: new Date('2026-09-01T00:00:00Z') }, now), false);
  assert.equal(isMembershipActive({ endDate: now }, now), false, 'endDate == now is ended');
  assert.equal(isMembershipActive(null, now), false, 'no membership is not active');
  assert.equal(isMembershipActive(undefined, now), false);
});

test('MR-3: one active-membership predicate at the database, shared by login, refresh and the SSR guard', () => {
  const src = stripComments(read('src', 'lib', 'session.ts'));
  const finder = src.slice(src.indexOf('export async function findActiveMembership'));
  assert.ok(finder.length > 0, 'findActiveMembership must exist in lib/session.ts');
  const body = finder.slice(0, finder.indexOf('\n}') + 2);
  assert.match(body, /endDate/, 'the predicate must consult endDate');
  assert.match(body, /OR:\s*\[\s*\{\s*endDate:\s*null\s*\}/, 'endDate IS NULL …');
  assert.match(body, /endDate:\s*\{\s*gt:/, '… OR endDate > now — evaluated by Postgres, not in JS after the fact');
  assert.match(body, /role:\s*true/, 'the finder must return the role so the claim is derived from this row');
  const validate = src.slice(src.indexOf('export async function validateMembership'));
  const vbody = validate.slice(0, validate.indexOf('\n}') + 2);
  assert.match(vbody, /findActiveMembership\(/, 'validateMembership (SSR guard INV-4) must use the same predicate');
});

// ── MR-2 — derived, never written ───────────────────────────────────────────

test('MR-2: no role literal is signed into a token anywhere in the auth routes', () => {
  for (const file of [path.join('login', 'route.ts'), path.join('refresh', 'route.ts')]) {
    const src = stripComments(read('src', 'app', 'api', 'auth', file));
    assert.doesNotMatch(src, /role:\s*['"](admin|member)['"]/, `${file} signs a literal role`);
    assert.match(src, /toTokenRole\(/, `${file} must derive the role from the membership`);
  }
});

test('MR-2: login takes role and endDate from the membership row and refuses an ended one', () => {
  const src = stripComments(read('src', 'app', 'api', 'auth', 'login', 'route.ts'));
  assert.match(src, /findActiveMembership\(/, 'login must read the membership through the shared active predicate');
  assert.doesNotMatch(
    src,
    /workerOrgRelationship\.findFirst/,
    'login must not query the membership directly — one predicate, in lib/session.ts'
  );
  assert.match(src, /isMembershipActive\(/, 'login must refuse an ended membership');
  assert.match(src, /toTokenRole\(rel\.role\)/, 'the token role must come from the row that was just checked');
  assert.match(src, /NOT_ASSOCIATED/, 'an ended membership must look exactly like no membership to the caller');
});

test('MR-2: refresh re-reads the membership and revokes the session when it is gone', () => {
  const src = stripComments(read('src', 'app', 'api', 'auth', 'refresh', 'route.ts'));
  assert.match(src, /workerOrgRelationship\.findFirst|findActiveMembership\(/, 'refresh must re-read the membership');
  assert.match(src, /isMembershipActive\(|findActiveMembership\(/, 'refresh must check the membership is active');
  assert.match(src, /revokeSession\(/, 'a refresh with no active membership must revoke the session');
  assert.match(src, /clearCookies\(\)/, 'and clear both cookies');
});

// ── MR-7 — one predicate for future gates ───────────────────────────────────

test('MR-7: hasRole — admin satisfies every role, member satisfies only member', () => {
  const { hasRole } = requireRoles();
  assert.equal(hasRole({ role: 'admin' }, 'admin'), true);
  assert.equal(hasRole({ role: 'admin' }, 'member'), true);
  assert.equal(hasRole({ role: 'member' }, 'member'), true);
  assert.equal(hasRole({ role: 'member' }, 'admin'), false);
  for (const bad of [{ role: 'owner' }, { role: '' }, {}, null, undefined]) {
    assert.equal(hasRole(bad, 'member'), false, `${JSON.stringify(bad)} must not satisfy any role`);
  }
  assert.equal(hasRole({ role: 'admin' }, 'owner'), false, 'an unknown required role is never satisfied');
});

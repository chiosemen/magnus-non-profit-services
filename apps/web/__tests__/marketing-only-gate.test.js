/**
 * PS-1 · PS-2 · PS-5 · PS-6 · PS-8 — the public marketing deployment must not
 * serve the application surface.
 *
 * Spec: docs/security/PUBLIC-SURFACE-SEPARATION.md · SPEC-P0 R14.
 *
 * Threat (stated per SPEC-P0 §0): the apex hostname is the one that goes on
 * outbound material. Publishing `/login`, `/app/*` and `/api/*` there while
 * `role: 'admin'` is hardcoded (release record 7430ad0 §7) and six orgs hold
 * unaudited ACTIVE entitlement (§6) advertises an auth surface to an audience
 * with no account, and discloses the application topology behind a marketing
 * domain.
 *
 * SPEC-P0 rules exercised:
 * - R11 / PS-5: the gate is asserted against `.next/server/src/middleware.js`
 *   and `.next/server/middleware-manifest.json` — the BUILT artifact. A gate
 *   present only in the source tree is precisely the P0-6 failure mode.
 * - R2: no vacuous pass — a missing build artifact is a hard failure, never a
 *   skip, and every allowlist assertion has a matching negative case.
 * - R12: run against the pre-change tree and observed red (the module under
 *   test did not exist) before the implementation was written.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.join(__dirname, '..');
const surfacePath = path.join(webRoot, 'src', 'lib', 'public-surface.js');
const middlewareSourcePath = path.join(webRoot, 'src', 'middleware.ts');
const manifestPath = path.join(webRoot, '.next', 'server', 'middleware-manifest.json');
const bundlePath = path.join(webRoot, '.next', 'server', 'src', 'middleware.js');

function requireSurface() {
  assert.ok(
    fs.existsSync(surfacePath),
    `missing ${surfacePath} — the marketing allowlist must live in one module ` +
      'shared by the middleware and this test, so the test exercises the real ' +
      'decision function rather than a copy of it'
  );
  return require(surfacePath);
}

/**
 * Assertions about what the gate DOES must read code, not prose. The block
 * comment in the middleware explains why 403 is the wrong status, and a naive
 * scan would match that explanation and pass/fail on documentation. The `\s`
 * guard on the line-comment pattern keeps `https://` intact.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function readBuiltArtifact(file, label) {
  assert.ok(
    fs.existsSync(file),
    `Build artifact missing: ${file}. Run \`pnpm build\` in apps/web before ` +
      `testing — ${label} is asserted against the build, not the source, per ` +
      'SPEC-P0 R11. This test intentionally fails rather than skips.'
  );
  return fs.readFileSync(file, 'utf8');
}

// ── PS-1 — allowlist, not denylist ──────────────────────────────────────────

test('PS-1: the marketing allowlist admits exactly the two buyer-facing pages', () => {
  const { isPublicMarketingPath } = requireSurface();
  for (const allowed of ['/', '/book-audit']) {
    assert.equal(isPublicMarketingPath(allowed), true, `${allowed} must be served`);
  }
});

test('PS-1: build assets required to render those pages are admitted', () => {
  const { isPublicMarketingPath } = requireSurface();
  for (const allowed of [
    '/_next/static/chunks/main.js',
    '/_next/static/css/app.css',
    '/_next/image',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
  ]) {
    assert.equal(isPublicMarketingPath(allowed), true, `${allowed} must be served`);
  }
});

test('PS-1: every application path is refused', () => {
  const { isPublicMarketingPath } = requireSurface();
  for (const blocked of [
    '/app',
    '/app/',
    '/app/donors',
    '/app/autonomous-ops/executive',
    '/login',
    '/api',
    '/api/health',
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/me',
    '/api/org/anything',
    '/api/public/anything',
    '/api/dashboard/summary',
    '/tools',
    '/campaigns/spring-appeal',
    '/campaigns/spring-appeal/success',
  ]) {
    assert.equal(isPublicMarketingPath(blocked), false, `${blocked} must NOT be served`);
  }
});

test('PS-1: the allowlist is exact — no prefix, case, or separator confusion', () => {
  const { isPublicMarketingPath } = requireSurface();
  for (const blocked of [
    '/book-audit-internal', // prefix confusion
    '/book-auditor',
    '/BOOK-AUDIT', // case
    '/App/donors',
    '/_nextjs-admin', // prefix confusion on the asset prefix
    '/_next', // the bare segment is not an asset path
    '//app/donors', // protocol-relative
    '/./app',
    '/book-audit/../app/donors',
  ]) {
    assert.equal(isPublicMarketingPath(blocked), false, `${blocked} must NOT be served`);
  }
});

test('PS-1: an application route added later is blocked by default', () => {
  const { isPublicMarketingPath } = requireSurface();
  // No implementation may satisfy this by listing known routes.
  for (const unknown of ['/admin', '/api/v2/anything', '/app/some-future-page', '/internal']) {
    assert.equal(isPublicMarketingPath(unknown), false, `${unknown} must NOT be served`);
  }
});

// ── PS-8 / PS-4 — mode is an environment property, read strictly ─────────────

test('PS-8: marketing mode is read from the environment at request time', () => {
  const { isMarketingOnly } = requireSurface();
  assert.equal(isMarketingOnly({ MARKETING_ONLY: 'true' }), true);
  assert.equal(isMarketingOnly({}), false, 'absent means application mode');
  assert.equal(isMarketingOnly({ MARKETING_ONLY: 'false' }), false);
});

test('PS-4: only the exact string "true" enables marketing mode in the request path', () => {
  const { isMarketingOnly } = requireSurface();
  // Malformed values are rejected at boot by assertMarketingOnlyEnvironment
  // (PS-4). The request path must never treat a malformed value as enabled and
  // silently half-apply the gate.
  for (const malformed of ['TRUE', 'True', '1', 'yes', 'on', ' true', 'true ', '']) {
    assert.equal(
      isMarketingOnly({ MARKETING_ONLY: malformed }),
      false,
      `${JSON.stringify(malformed)} must not enable the gate in the request path`
    );
  }
});

// ── PS-2 — blocked paths are opaque ─────────────────────────────────────────

test('PS-2: the block is an opaque 404 — not 403, not a redirect', () => {
  const src = stripComments(fs.readFileSync(middlewareSourcePath, 'utf8'));
  assert.match(src, /status:\s*404/, 'blocked paths must return 404');
  assert.doesNotMatch(src, /\b403\b/, 'a 403 confirms the path exists — use 404');
  assert.match(src, /new NextResponse\(\s*null/, 'the blocked response must carry no body');
  assert.match(src, /isMarketingOnly\(\)/, 'the middleware must consult the marketing gate');
});

test('PS-2: the response discloses no mode-identifying header', () => {
  const src = stripComments(fs.readFileSync(middlewareSourcePath, 'utf8'));
  assert.doesNotMatch(
    src,
    /['"]x-[a-z-]*marketing[a-z-]*['"]/i,
    'a mode header fingerprints the two-deployment topology'
  );
  assert.doesNotMatch(src, /['"]x-magnus-[a-z-]+['"]/i, 'no custom identifying header');
});

test('PS-2: the deployment does not advertise its framework', () => {
  // T3 — the marketing hostname should not disclose what runs behind it.
  const cfg = stripComments(fs.readFileSync(path.join(webRoot, 'next.config.js'), 'utf8'));
  assert.match(
    cfg,
    /poweredByHeader:\s*false/,
    'x-powered-by names the framework and version family to anyone who requests the apex'
  );
});

test('PS-9: only the marketing deployment invites indexing', () => {
  // Publishing the landing on the apex puts identical content on two
  // hostnames. Without this the application deployment competes with the apex
  // for the same terms and an authenticated app gets crawled.
  const robotsPath = path.join(webRoot, 'src', 'app', 'robots.ts');
  assert.ok(fs.existsSync(robotsPath), 'apps/web/src/app/robots.ts must exist');
  const src = stripComments(fs.readFileSync(robotsPath, 'utf8'));
  assert.match(src, /isMarketingOnly/, 'the answer must depend on the deployment mode');
  assert.match(
    src,
    /force-dynamic/,
    'robots.txt must be resolved per request — a statically generated answer ' +
      'would bake one deployment mode into the shared artifact (PS-8)'
  );
  assert.match(src, /disallow:\s*'\/'/, 'the application deployment must disallow all crawling');
});

// ── PS-5 — proved in the build artifact ─────────────────────────────────────

test('PS-5: the built middleware bundle contains the marketing gate', () => {
  const bundle = readBuiltArtifact(bundlePath, 'the marketing gate');
  assert.match(
    bundle,
    /MARKETING_ONLY/,
    'the compiled edge bundle must read MARKETING_ONLY — if this string is ' +
      'absent the gate was tree-shaken or never bundled'
  );
  assert.match(bundle, /book-audit/, 'the compiled bundle must carry the allowlist');
});

test('PS-5: the built matcher actually covers every path the gate must see', () => {
  const manifest = JSON.parse(readBuiltArtifact(manifestPath, 'the middleware matcher'));
  const entry = manifest.middleware && manifest.middleware['/'];
  assert.ok(entry, 'manifest.middleware["/"] entry must exist in the build artifact');
  const regexps = (entry.matchers ?? []).map((m) => new RegExp(m.regexp));
  const covers = (p) => regexps.some((r) => r.test(p));

  for (const guarded of [
    '/login',
    '/api/auth/login',
    '/api/health',
    '/tools',
    '/campaigns/spring-appeal',
    '/app/donors',
    '/book-audit',
    '/',
  ]) {
    assert.ok(covers(guarded), `compiled matcher must cover ${guarded}`);
  }
});

test('PS-5: static build assets bypass the middleware entirely', () => {
  const manifest = JSON.parse(readBuiltArtifact(manifestPath, 'the middleware matcher'));
  const entry = manifest.middleware && manifest.middleware['/'];
  const regexps = (entry.matchers ?? []).map((m) => new RegExp(m.regexp));
  const covers = (p) => regexps.some((r) => r.test(p));
  for (const asset of ['/_next/static/chunks/main.js', '/_next/image', '/favicon.ico']) {
    assert.equal(
      covers(asset),
      false,
      `${asset} must not invoke middleware — assets are served without a gate hop`
    );
  }
});

// ── PS-6 — no regression of the P0-6 auth boundary ──────────────────────────

test('PS-6: /app/:path* remains a declared matcher source (P0-6 regression)', () => {
  const manifest = JSON.parse(readBuiltArtifact(manifestPath, 'the P0-6 matcher'));
  const entry = manifest.middleware && manifest.middleware['/'];
  const sources = (entry.matchers ?? []).map((m) => m.originalSource);
  assert.ok(
    sources.includes('/app/:path*'),
    `the P0-6 matcher must survive the widening, got: ${JSON.stringify(sources)}`
  );
});

test('PS-6: outside marketing mode, only /app is gated and everything else passes through', () => {
  const { requiresAuthGate } = requireSurface();
  for (const gated of ['/app', '/app/donors', '/app/autonomous-ops/rules']) {
    assert.equal(requiresAuthGate(gated), true, `${gated} must keep its auth gate`);
  }
  for (const passthrough of ['/', '/book-audit', '/login', '/tools', '/api/auth/me', '/campaigns/x']) {
    assert.equal(
      requiresAuthGate(passthrough),
      false,
      `${passthrough} must pass through untouched — widening the matcher must ` +
        'not change any non-/app response'
    );
  }
});

test('PS-6: the auth redirect is still a redirect to /login, not a 404', () => {
  const src = fs.readFileSync(middlewareSourcePath, 'utf8');
  assert.match(src, /NextResponse\.redirect/, 'the P0-6 redirect must remain');
  assert.match(src, /['"]\/login['"]/, 'the redirect target must remain /login');
  assert.match(src, /searchParams\.set\('next'/, 'the next= round-trip must remain');
});

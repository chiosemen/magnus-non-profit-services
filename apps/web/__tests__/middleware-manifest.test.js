/**
 * P0-6 regression — auth middleware must be present in the BUILT ARTIFACT.
 *
 * Threat: apps/web uses the `src/` directory layout, so Next.js only picks up
 * middleware from `src/middleware.ts`. A root-level `apps/web/middleware.ts`
 * compiles cleanly and passes typecheck, yet is silently excluded from the
 * production build — every route matched by the middleware ships with NO auth
 * gate. At commit 9030f8b the built manifest contained `sortedMiddleware: []`.
 *
 * SPEC-P0 rules exercised here:
 * - R11: assert against `.next/server/middleware-manifest.json` (the build
 *   artifact), not the source tree. A missing manifest is a hard FAILURE,
 *   never a skip.
 * - R2: no vacuous pass — each assertion requires concrete manifest content.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.join(__dirname, '..');
const manifestPath = path.join(webRoot, '.next', 'server', 'middleware-manifest.json');

function loadManifest() {
  assert.ok(
    fs.existsSync(manifestPath),
    `Build artifact missing: ${manifestPath}. ` +
      'Run `pnpm build` in apps/web before testing — this test intentionally ' +
      'fails (not skips) without a build, per SPEC-P0 R2/R11.'
  );
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

test('built middleware-manifest registers the middleware under "/"', () => {
  const manifest = loadManifest();
  assert.ok(
    Array.isArray(manifest.sortedMiddleware),
    'middleware-manifest.json must contain a sortedMiddleware array'
  );
  assert.deepEqual(
    manifest.sortedMiddleware,
    ['/'],
    'sortedMiddleware must be ["/"] — an empty array means Next.js silently ' +
      'dropped the middleware (the P0-6 failure mode at 9030f8b)'
  );
  assert.ok(
    manifest.middleware && manifest.middleware['/'],
    'manifest.middleware["/"] entry must exist in the build artifact'
  );
});

test('built middleware matcher covers /app/:path*', () => {
  const manifest = loadManifest();
  const entry = manifest.middleware && manifest.middleware['/'];
  assert.ok(entry, 'manifest.middleware["/"] entry must exist');
  const matchers = entry.matchers ?? [];
  assert.ok(matchers.length >= 1, 'middleware entry must declare at least one matcher');
  const sources = matchers.map((m) => m.originalSource);
  assert.ok(
    sources.includes('/app/:path*'),
    `matcher originalSource must include "/app/:path*", got: ${JSON.stringify(sources)}`
  );
  const appMatcher = matchers.find((m) => m.originalSource === '/app/:path*');
  assert.ok(
    typeof appMatcher.regexp === 'string' && new RegExp(appMatcher.regexp).test('/app/dashboard'),
    'compiled matcher regexp must actually match an /app/* route'
  );
});

test('middleware source lives at src/middleware.ts, not the ignored root location', () => {
  assert.ok(
    fs.existsSync(path.join(webRoot, 'src', 'middleware.ts')),
    'apps/web/src/middleware.ts must exist (Next.js src-directory layout)'
  );
  assert.ok(
    !fs.existsSync(path.join(webRoot, 'middleware.ts')),
    'apps/web/middleware.ts must NOT exist at the app root — Next.js ignores ' +
      'it when a src/ directory is present, which caused P0-6'
  );
});

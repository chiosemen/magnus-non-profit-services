/**
 * Regression guard — workspace tests must run serialized.
 *
 * Several package test scripts rebuild shared workspace packages first, and
 * `packages/db`'s build runs `prisma generate`, which rewrites the generated
 * client under the shared node_modules in place. With pnpm's default
 * workspace concurrency, a sibling package's already-running test process
 * can import `@prisma/client` mid-rewrite. Observed on PR #11 CI run
 * 32147017533 (2026-08-18): apps/billing crashed at import with
 * "TypeError: Cannot read properties of undefined (reading
 * 'defineExtension')" while packages/org-autonomous-ops-context was
 * concurrently rebuilding @magnus/db. Serializing the recursive run
 * (--workspace-concurrency=1) removes the race; it also keeps database
 * suites from sharing the ephemeral CI database concurrently.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('root test script serializes the recursive workspace test run', () => {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  const script = pkg.scripts && pkg.scripts.test ? pkg.scripts.test : '';
  assert.ok(
    /pnpm -r --workspace-concurrency=1 /.test(script),
    'root "test" script must run `pnpm -r --workspace-concurrency=1 --if-present test`; ' +
      'concurrent package test runs race prisma generate against live imports ' +
      '(see PR #11 CI run 32147017533)'
  );
});

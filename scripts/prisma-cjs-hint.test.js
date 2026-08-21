/**
 * packages/db/scripts/prisma.cjs is the fatal path operators hit when
 * DATABASE_URL is missing. Staging is Railway Postgres. A hint that names
 * Neon sends the operator to the wrong provider and has already been a
 * source of wrong inference.
 *
 * R12: this file was added and run against 7430ad0 (Neon string present)
 * before the wrapper was edited.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WRAPPER = path.join(__dirname, '..', 'packages', 'db', 'scripts', 'prisma.cjs');

test('prisma.cjs exists', () => {
  assert.ok(fs.existsSync(WRAPPER), 'packages/db/scripts/prisma.cjs must exist');
});

test('missing-DATABASE_URL hint must not name Neon', () => {
  const src = fs.readFileSync(WRAPPER, 'utf8');
  assert.doesNotMatch(
    src,
    /Neon/,
    'prisma.cjs must not name Neon — staging and the deployed provider are Railway Postgres'
  );
});

test('missing-DATABASE_URL path still fails closed', () => {
  const src = fs.readFileSync(WRAPPER, 'utf8');
  assert.match(src, /FATAL: DATABASE_URL not set/);
  assert.match(src, /process\.exit\(1\)/);
});

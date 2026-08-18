/**
 * Self-test for scripts/assert-test-count.js (P0-1, SPEC-P0 R2/R5).
 *
 * Proves the failure mode the guard exists for: a test invocation that
 * discovers zero tests (or fewer than the committed floor) must exit
 * non-zero. Before P0-1, `node --test dist/tests` could go green with no
 * tests executed; case 1 below is that exact scenario run through the guard.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const GUARD = path.join(__dirname, 'assert-test-count.js');

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-test-count-'));
  fs.mkdirSync(path.join(dir, 'dist', 'tests'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, 'dist', 'tests', name), content);
  }
  return dir;
}

function runGuard(cwd, args) {
  return spawnSync(process.execPath, [GUARD, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

const PASSING = `const test = require('node:test');\ntest('t', () => {});\n`;
const FAILING = `const test = require('node:test');\ntest('t', () => { throw new Error('boom'); });\n`;
const SKIPPED = `const test = require('node:test');\ntest('t', { skip: 'reason' }, () => {});\n`;

test('zero discovered tests is a hard failure, never a vacuous pass', () => {
  const dir = fixture({ 'helper.js': 'module.exports = {};\n' });
  const res = runGuard(dir, ['--min', '1', '--glob', 'dist/tests/**/*.test.js']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /0 test files matched/);
});

test('missing build directory is a hard failure', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assert-test-count-'));
  const res = runGuard(dir, ['--min', '1', '--glob', 'dist/tests/**/*.test.js']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /does not exist/);
});

test('passing tests meeting the minimum exit 0', () => {
  const dir = fixture({ 'a.test.js': PASSING, 'b.test.js': PASSING });
  const res = runGuard(dir, ['--min', '2', '--glob', 'dist/tests/**/*.test.js']);
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
  assert.match(res.stdout, /OK: 2 passing test\(s\) >= required minimum 2/);
});

test('passing tests below the minimum exit 1', () => {
  const dir = fixture({ 'a.test.js': PASSING, 'b.test.js': PASSING });
  const res = runGuard(dir, ['--min', '3', '--glob', 'dist/tests/**/*.test.js']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /requires at least 3/);
});

test('a failing test exits 1 even when the count floor is met', () => {
  const dir = fixture({ 'a.test.js': PASSING, 'b.test.js': FAILING });
  const res = runGuard(dir, ['--min', '1', '--glob', 'dist/tests/**/*.test.js']);
  assert.equal(res.status, 1);
});

test('skipped tests do not count toward the minimum', () => {
  const dir = fixture({ 'a.test.js': PASSING, 'b.test.js': SKIPPED });
  const res = runGuard(dir, ['--min', '2', '--glob', 'dist/tests/**/*.test.js']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /only 1 passing test\(s\)/);
});

test('nested test files under the recursive glob are discovered', () => {
  const dir = fixture({ 'a.test.js': PASSING });
  fs.mkdirSync(path.join(dir, 'dist', 'tests', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'tests', 'nested', 'c.test.js'), PASSING);
  const res = runGuard(dir, ['--min', '2', '--glob', 'dist/tests/**/*.test.js']);
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
  assert.match(res.stdout, /discovered 2 test file\(s\)/);
});

test('unknown pass-through args (e.g. -- --coverage) warn instead of crashing', () => {
  const dir = fixture({ 'a.test.js': PASSING });
  const res = runGuard(dir, ['--min', '1', '--glob', 'dist/tests/**/*.test.js', '--coverage']);
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
  assert.match(res.stderr, /ignoring unknown argument "--coverage"/);
});

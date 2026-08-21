/**
 * Merge-authority check tests (P0-5).
 *
 * R12: the policy-file tests below were run against accord-security-policy.yaml
 * while it still had `merge_authority: false` (a sentence, not a check) and
 * were observed to fail. The evaluate() cases do not depend on that file.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const {
  POLICY_PATH,
  evaluate,
  loadRuleFromPolicy,
  pathMatches,
} = require('./merge-authority.js');

const RULE = { ci: 'green', base: 'main', pathsOnly: ['docs/**'] };
const CHECK = path.join(__dirname, 'merge-authority.js');

test('docs/** matches nested docs paths and rejects everything else', () => {
  assert.equal(pathMatches('docs/releases/7430ad0.md', 'docs/**'), true);
  assert.equal(pathMatches('docs/operations/STAGING_VERIFY_RUNBOOK_7430ad0.md', 'docs/**'), true);
  assert.equal(pathMatches('BLOCKERS_TO_PRODUCTION.md', 'docs/**'), false);
  assert.equal(pathMatches('accord-security-policy.yaml', 'docs/**'), false);
  assert.equal(pathMatches('packages/db/scripts/prisma.cjs', 'docs/**'), false);
  assert.equal(pathMatches('apps/web/src/middleware.ts', 'docs/**'), false);
  assert.equal(pathMatches('src/index.ts', 'docs/**'), false);
  assert.equal(pathMatches('gates/anything', 'docs/**'), false);
});

test('evaluate allows docs-only + main + CI green', () => {
  const r = evaluate({
    base: 'main',
    ci: 'green',
    files: ['docs/releases/7430ad0.md', 'docs/operations/runbook.md'],
    rule: RULE,
  });
  assert.equal(r.allowed, true);
  assert.deepEqual(r.reasons, []);
});

test('evaluate denies a packages/ path even when CI and base hold', () => {
  const r = evaluate({
    base: 'main',
    ci: 'green',
    files: ['docs/a.md', 'packages/db/scripts/prisma.cjs'],
    rule: RULE,
  });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.some((x) => x.startsWith('PATHS_OUTSIDE_ALLOWLIST:')));
  assert.match(r.reasons.join('\n'), /packages\/db\/scripts\/prisma\.cjs/);
});

test('evaluate denies the policy file itself', () => {
  const r = evaluate({
    base: 'main',
    ci: 'green',
    files: ['accord-security-policy.yaml'],
    rule: RULE,
  });
  assert.equal(r.allowed, false);
  assert.match(r.reasons.join('\n'), /accord-security-policy\.yaml/);
});

test('evaluate denies apps/, src/, and gates/ the same way', () => {
  for (const file of ['apps/web/src/x.ts', 'src/x.ts', 'gates/x']) {
    const r = evaluate({ base: 'main', ci: 'green', files: [file], rule: RULE });
    assert.equal(r.allowed, false, file);
    assert.match(r.reasons.join('\n'), /PATHS_OUTSIDE_ALLOWLIST/);
  }
});

test('evaluate denies when base is not main', () => {
  const r = evaluate({
    base: 'staging',
    ci: 'green',
    files: ['docs/a.md'],
    rule: RULE,
  });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('BASE_NOT_MAIN:staging'));
});

test('evaluate denies when CI is not green', () => {
  const r = evaluate({
    base: 'main',
    ci: 'pending',
    files: ['docs/a.md'],
    rule: RULE,
  });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('CI_NOT_GREEN:pending'));
});

test('evaluate denies an empty file list (vacuous merge)', () => {
  const r = evaluate({ base: 'main', ci: 'green', files: [], rule: RULE });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('NO_FILES'));
});

test('policy file must encode merge as when_all, not a boolean', () => {
  const yaml = fs.readFileSync(POLICY_PATH, 'utf8');
  const rule = loadRuleFromPolicy(yaml);
  assert.equal(rule.ci, 'green');
  assert.equal(rule.base, 'main');
  assert.ok(rule.pathsOnly.includes('docs/**'));
});

test('denied_actions must not blanket-deny merge', () => {
  const yaml = fs.readFileSync(POLICY_PATH, 'utf8');
  const cursorBlock = yaml.slice(yaml.indexOf('\ncursor:'), yaml.indexOf('\norchestrator:'));
  const denied = cursorBlock.match(/denied_actions:\s*\[([^\]]+)\]/);
  assert.ok(denied, 'denied_actions list must exist');
  const items = denied[1].split(',').map((s) => s.trim());
  assert.ok(!items.includes('merge'), 'merge must not be a blanket denied_action');
});

test('CLI denies PR-shaped paths that leave docs/**', () => {
  const res = spawnSync(
    process.execPath,
    [
      CHECK,
      '--base',
      'main',
      '--ci',
      'green',
      '--files',
      'BLOCKERS_TO_PRODUCTION.md',
      'docs/releases/7430ad0.md',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(res.status, 1);
  assert.match(res.stderr, /PATHS_OUTSIDE_ALLOWLIST:BLOCKERS_TO_PRODUCTION\.md/);
});

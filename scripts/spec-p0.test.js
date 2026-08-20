/**
 * SPEC-P0 presence + integrity guard.
 *
 * SPEC-P0.md is the binding rulebook the merge gate (§4) and R12 author
 * assertions reference. If it can be deleted or gutted without a test going
 * red, it is not actually binding — it is a suggestion. This test keeps the
 * canonical file present and keeps every binding rule and the merge gate in
 * it, mirroring scripts/release-doc.test.js for the release record.
 *
 * R12: verified failing before SPEC-P0.md existed (the file was written after
 * this test), and passing after.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SPEC = path.join(__dirname, '..', 'SPEC-P0.md');

test('SPEC-P0.md exists at the repository root', () => {
  assert.ok(fs.existsSync(SPEC), 'SPEC-P0.md must exist — it is the binding rulebook §4 references');
});

test('every binding rule R1..R13 is present', () => {
  const spec = fs.readFileSync(SPEC, 'utf8');
  for (let n = 1; n <= 13; n += 1) {
    assert.ok(
      new RegExp(`(^|\\n)### R${n} `).test(spec),
      `binding rule R${n} must be present in SPEC-P0.md`
    );
  }
});

test('R12 (run every check against the defective state) is marked a HARD RULE', () => {
  const spec = fs.readFileSync(SPEC, 'utf8');
  const r12 = spec.slice(spec.indexOf('### R12'), spec.indexOf('### R13'));
  assert.ok(r12.length > 0, 'R12 section must exist');
  assert.match(r12, /HARD RULE/, 'R12 must be marked a HARD RULE');
  assert.match(
    r12,
    /observed to fail/i,
    'R12 must require the check be observed to fail against the broken state'
  );
});

test('the merge gate (§4) is present and forbids merging on a red gate', () => {
  const spec = fs.readFileSync(SPEC, 'utf8');
  assert.match(spec, /## 4\. Merge gate/, 'the merge gate section must be present');
  assert.match(spec, /No merge on a red gate/i, 'the merge gate must forbid merging on a red gate');
  assert.match(spec, /No direct pushes to `main`/i, 'the merge gate must forbid direct pushes to main');
});

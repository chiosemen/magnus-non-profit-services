/**
 * P0-5 (SPEC-P0 R5) — the release record for the audited commit must exist
 * and carry every gate the release decision depends on. BLOCKERS_TO_PRODUCTION.md
 * is superseded: it must remain only as a pointer stub, with the original
 * archived verbatim.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const releaseDocPath = path.join(root, 'docs', 'releases', '9030f8b.md');
const stubPath = path.join(root, 'BLOCKERS_TO_PRODUCTION.md');
const archivePath = path.join(
  root,
  'docs',
  'releases',
  'archive',
  'BLOCKERS_TO_PRODUCTION-2026-06-11.md'
);

test('release document for 9030f8b exists', () => {
  assert.ok(fs.existsSync(releaseDocPath), `missing ${releaseDocPath}`);
});

test('release document carries every required gate section', () => {
  const doc = fs.readFileSync(releaseDocPath, 'utf8');
  const requiredMarkers = [
    '## CI evidence',
    '## Staging smoke',
    '## Security header check',
    '## Database integration',
    '## Rollback owner',
    '## Approved scope',
    '9030f8b', // the audited ref
    'docs/releases/archive/BLOCKERS_TO_PRODUCTION-2026-06-11.md', // pointer to the old file
  ];
  for (const marker of requiredMarkers) {
    assert.ok(doc.includes(marker), `release doc must contain ${JSON.stringify(marker)}`);
  }
});

test('release document never leaves the rollback owner silently blank', () => {
  const doc = fs.readFileSync(releaseDocPath, 'utf8');
  // Either a named owner has been recorded, or the document explicitly says
  // the gate is unassigned and blocking. A missing/empty field would let a
  // release proceed with nobody accountable for rollback.
  assert.ok(
    /Rollback owner[\s\S]{0,400}(UNASSIGNED|@\w+|[A-Z][a-z]+ [A-Z][a-z]+)/.test(doc),
    'rollback owner section must name an owner or state UNASSIGNED explicitly'
  );
});

test('BLOCKERS_TO_PRODUCTION.md is a pointer stub to the release record', () => {
  const stub = fs.readFileSync(stubPath, 'utf8');
  assert.ok(
    stub.includes('docs/releases/9030f8b.md'),
    'root blockers file must point at the release record'
  );
  assert.ok(
    stub.length < 2000,
    'root blockers file must be a stub, not a second source of truth'
  );
});

test('the original blockers document is archived verbatim', () => {
  assert.ok(fs.existsSync(archivePath), `missing ${archivePath}`);
  const archived = fs.readFileSync(archivePath, 'utf8');
  assert.ok(
    archived.includes('Current status as of 2026-06-11'),
    'archive must preserve the original dated content'
  );
});

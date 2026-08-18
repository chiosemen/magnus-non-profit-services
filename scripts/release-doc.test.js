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

// ─── Staging verification gate (P0-5 continuation) ───────────────────────────

const stagingWorkflowPath = path.join(root, '.github', 'workflows', 'staging-verify.yml');

test('staging verification workflow exists and covers all three release-gate checks', () => {
  assert.ok(fs.existsSync(stagingWorkflowPath), `missing ${stagingWorkflowPath}`);
  const wf = fs.readFileSync(stagingWorkflowPath, 'utf8');
  assert.match(wf, /workflow_dispatch/, 'must be manually dispatchable after a staging deploy');
  assert.match(wf, /Check 1: health endpoints responsive/);
  assert.match(wf, /Check 2: live security headers/);
  assert.match(wf, /Check 3: unauthenticated \/app redirects to \/login/);
  // Check 4 is the only middleware-SPECIFIC probe: /app itself is also
  // guarded by a server component (requireAuthOrRedirect), so a redirect
  // there proves nothing about the middleware. Verified live against
  // pre-fix staging (run 32173120899): /app returned 307 -> /login with NO
  // middleware deployed. The probe must hit a path with no page and must
  // treat 404 as failure.
  assert.match(wf, /Check 4: middleware intercepts a route with no page/);
  assert.match(wf, /__middleware_probe_no_page/);
  assert.match(wf, /404\) echo "FAIL/, 'a 404 on the probe must fail the check, not pass it');
  for (const h of ['content-security-policy', 'strict-transport-security', 'x-frame-options']) {
    assert.ok(wf.includes(h), `header check must assert ${h}`);
  }
});

test('release record points at the staging verification workflow', () => {
  const doc = fs.readFileSync(releaseDocPath, 'utf8');
  assert.ok(
    doc.includes('.github/workflows/staging-verify.yml'),
    'release record must name the workflow that produces staging evidence'
  );
});

test('release record cannot claim READY_FOR_DEPLOYMENT while any gate is PENDING', () => {
  const doc = fs.readFileSync(releaseDocPath, 'utf8');
  if (doc.includes('READY_FOR_DEPLOYMENT')) {
    assert.ok(
      !/Gate: `PENDING`/.test(doc),
      'READY_FOR_DEPLOYMENT is not permitted while a gate is still PENDING — ' +
        'record the staging evidence first (SPEC-P0 R4: no unverified claims)'
    );
  }
});

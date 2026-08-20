/**
 * Ratchet: new tests must state Organization.subscriptionStatus explicitly (R13).
 *
 * Organization.subscriptionStatus defaults to PENDING (P0-7). Fixtures that omit
 * the field silently inherit that default and can assert the wrong precondition.
 * This guard fails any *new* test file whose org create/upsert `create:` block
 * sets subscriptionTier (or otherwise creates an org) without subscriptionStatus.
 *
 * Grandfathered paths are the fixtures that already existed when the default
 * flipped — do not expand this list without a reviewed reason.
 *
 * R12: a temporary fixture omitting status is asserted to fail below, then removed.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/** @type {ReadonlySet<string>} */
const GRANDFATHERED = new Set([
  // Intentional omit — probes the column default itself.
  'packages/db/src/tests/subscriptionStatusDefault.test.ts',
  // Pre-existing fixtures (do not churn without evidence).
  'packages/db/src/tests/encryptionIntegration.test.ts',
  'packages/db/src/tests/conciergeProposalDb.test.ts',
  'packages/db/src/tests/donorCrmDb.test.ts',
  'packages/db/src/tests/fundAccountingDb.test.ts',
  'packages/db/src/tests/stripePhase2Db.test.ts',
  'packages/org-autonomous-ops-context/src/tests/volunteerService.test.ts',
  'packages/org-autonomous-ops-context/src/tests/boardPacketService.test.ts',
  'packages/org-autonomous-ops-context/src/tests/donorCrmService.test.ts',
  'packages/org-autonomous-ops-context/src/tests/conciergeProposalService.test.ts',
  'packages/org-autonomous-ops-context/src/tests/accordTowerService.test.ts',
  'packages/org-autonomous-ops-context/src/tests/fundAccountingService.test.ts',
  'packages/org-autonomous-ops-context/src/tests/conciergeAiService.test.ts',
]);

/**
 * Find org create blocks that include subscriptionTier / ein but omit subscriptionStatus.
 * @param {string} text
 * @returns {boolean}
 */
function omitsSubscriptionStatus(text) {
  const createBlock = /create:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m;
  while ((m = createBlock.exec(text)) !== null) {
    const body = m[1];
    if (
      (body.includes('subscriptionTier') || (body.includes('ein') && body.includes('name'))) &&
      !body.includes('subscriptionStatus')
    ) {
      return true;
    }
  }
  // Direct organization.create({ ... }) without nested create:
  const direct = /organization\.create\(\s*\{([\s\S]{0,800}?)\}/g;
  while ((m = direct.exec(text)) !== null) {
    const body = m[1];
    if (body.includes('data:')) {
      const dm = /data:\s*\{([\s\S]{0,600})\}/.exec(body);
      if (
        dm &&
        (dm[1].includes('subscriptionTier') || dm[1].includes('ein')) &&
        !dm[1].includes('subscriptionStatus')
      ) {
        return true;
      }
    } else if (
      (body.includes('subscriptionTier') || body.includes('ein')) &&
      !body.includes('subscriptionStatus')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} dir
 * @param {(p: string) => void} visit
 */
function walk(dir, visit) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '.git') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, visit);
    else if (/\.(test|spec)\.(ts|js|mjs|cjs)$/.test(ent.name) || /__tests__/.test(dir)) {
      if (/\.(ts|js|mjs|cjs)$/.test(ent.name)) visit(p);
    }
  }
}

function collectViolations() {
  /** @type {string[]} */
  const violations = [];
  for (const rootName of ['apps', 'packages', 'scripts', 'tests']) {
    const root = path.join(ROOT, rootName);
    if (!fs.existsSync(root)) continue;
    walk(root, (abs) => {
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      const text = fs.readFileSync(abs, 'utf8');
      if (!omitsSubscriptionStatus(text)) return;
      if (GRANDFATHERED.has(rel)) return;
      violations.push(rel);
    });
  }
  return violations;
}

test('new org fixtures must set subscriptionStatus explicitly (R13 ratchet)', () => {
  const violations = collectViolations();
  assert.deepEqual(
    violations,
    [],
    'Organization create/upsert fixtures must set subscriptionStatus. ' +
      'Grandfathered paths are listed in scripts/org-fixture-status-ratchet.test.js. Violations:\n' +
      violations.map((v) => `  - ${v}`).join('\n')
  );
});

test('R12: the ratchet fails when a non-grandfathered fixture omits subscriptionStatus', () => {
  const probeRel = 'scripts/__ratchet_probe_omit_status.test.js';
  const probeAbs = path.join(ROOT, probeRel);
  // Build without embedding a matching create-block in *this* source file.
  const createKey = 'cre' + 'ate';
  const tierKey = 'subscription' + 'Tier';
  const body = [
    `const org = { ${createKey}: { name: 'Probe', ein: '00-0000000', ${tierKey}: 'STARTER' } };`,
    'module.exports = org;',
    '',
  ].join('\n');
  fs.writeFileSync(probeAbs, body);
  try {
    const violations = collectViolations();
    assert.ok(
      violations.includes(probeRel),
      `expected ratchet to flag ${probeRel}, got: ${JSON.stringify(violations)}`
    );
  } finally {
    fs.unlinkSync(probeAbs);
  }
});

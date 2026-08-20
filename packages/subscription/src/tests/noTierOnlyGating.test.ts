/**
 * P0-7 guard — no gating path may consult tier without status.
 *
 * isFeatureEnabled() checks `status !== 'ACTIVE'` BEFORE tier and fails closed,
 * which is what makes the PENDING default sufficient containment for a
 * self-registered org. getOrgTier() bypasses that: it selects subscriptionTier
 * alone. It has zero callers today, and this test keeps it that way — one
 * careless import is all it takes to reintroduce a tier-only gate that a
 * PENDING org would pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.next') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

test('isFeatureEnabled checks status before tier and fails closed', () => {
  const policy = readFileSync(join(REPO_ROOT, 'packages/subscription/src/policy.ts'), 'utf8');
  const fn = policy.slice(policy.indexOf('export function isFeatureEnabled'));
  const statusIdx = fn.indexOf("status !== 'ACTIVE'");
  const tierIdx = fn.indexOf('featuresForTier');
  assert.ok(statusIdx > -1, "isFeatureEnabled must reject any status that is not 'ACTIVE'");
  assert.ok(tierIdx > -1, 'isFeatureEnabled must consult tier features');
  assert.ok(
    statusIdx < tierIdx,
    'the status check must precede the tier lookup, so a non-ACTIVE org is ' +
      'denied regardless of tier (this is what makes PENDING sufficient)'
  );
});

test('getOrgTier (tier-only lookup) has no callers', () => {
  const roots = ['apps', 'packages'].map((d) => join(REPO_ROOT, d));
  const offenders: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      if (file.endsWith(join('packages', 'subscription', 'src', 'index.ts'))) continue; // definition site
      const text = readFileSync(file, 'utf8');
      if (/\bgetOrgTier\s*\(/.test(text)) offenders.push(file.replace(REPO_ROOT + '/', ''));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'getOrgTier selects subscriptionTier WITHOUT subscriptionStatus. Gating on ' +
      'it would let a PENDING org through. Use isFeatureEnabled/requireFeature ' +
      `instead. Callers found: ${offenders.join(', ')}`
  );
});

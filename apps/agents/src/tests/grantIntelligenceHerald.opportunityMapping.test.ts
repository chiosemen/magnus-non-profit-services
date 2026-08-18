/**
 * P0-4 regression — HERALD opportunity mapping must never fabricate data
 * (SPEC-P0 R4, R5).
 *
 * Before this fix, mapCandidGrant:
 * - synthesized opportunity ids with Math.random() (a new identity on every
 *   run, so dedupe keys, LOI selections, and operational memory references
 *   pointed at ids that would never match a later run),
 * - fabricated 'Unknown funder' / 'Program' strings for missing fields,
 * - defaulted a missing accepts_unsolicited to TRUE (a favorable claim the
 *   source never made).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCandidGrant } from '../agents/grantIntelligenceHerald/opportunityClient';

const RAW_NO_ID = {
  funder_name: 'Example Community Trust',
  program_name: 'Youth Education Fund',
  application_url: 'https://example.invalid/apply',
  min_grant_amount: 5000,
  max_grant_amount: 25000,
};

test('id from the provider is used verbatim', () => {
  const opp = mapCandidGrant({ ...RAW_NO_ID, id: 'candid-abc-123' });
  assert.ok(opp);
  assert.equal(opp.id, 'candid-abc-123');
  assert.equal(opp.provenance.idSource, 'provider');
});

test('missing provider id yields a DETERMINISTIC content-hash id', () => {
  const a = mapCandidGrant(RAW_NO_ID);
  const b = mapCandidGrant({ ...RAW_NO_ID });
  assert.ok(a && b);
  assert.equal(a.id, b.id, 'same content must map to the same id on every call');
  assert.match(a.id, /^candid-sha256-[0-9a-f]{16}$/);
  assert.equal(a.provenance.idSource, 'content-hash');

  const c = mapCandidGrant({ ...RAW_NO_ID, program_name: 'A Different Program' });
  assert.ok(c);
  assert.notEqual(a.id, c.id, 'different content must map to a different id');
});

test('a record with no identifying content is rejected, not given an identity', () => {
  const opp = mapCandidGrant({ description: 'no id, no funder, no program, no url' });
  assert.equal(opp, null);
});

test('missing funder/program become null with provenance, not fabricated strings', () => {
  const opp = mapCandidGrant({ id: 'candid-xyz', description: 'names withheld' });
  assert.ok(opp);
  assert.equal(opp.funderName, null);
  assert.equal(opp.programName, null);
  assert.ok(opp.provenance.missingFields.includes('funderName'));
  assert.ok(opp.provenance.missingFields.includes('programName'));
});

test('missing accepts_unsolicited is null (unknown), never defaulted to true', () => {
  const opp = mapCandidGrant({ ...RAW_NO_ID });
  assert.ok(opp);
  assert.equal(opp.acceptsUnsolicited, null);
  assert.ok(opp.provenance.missingFields.includes('acceptsUnsolicited'));

  const explicit = mapCandidGrant({ ...RAW_NO_ID, accepts_unsolicited: false });
  assert.ok(explicit);
  assert.equal(explicit.acceptsUnsolicited, false);
});

test('defaulted numeric fields are declared in provenance', () => {
  const opp = mapCandidGrant({ id: 'candid-num', funder_name: 'F' });
  assert.ok(opp);
  assert.equal(opp.totalGiving, 0);
  for (const f of ['minGrantAmount', 'maxGrantAmount', 'totalGiving', 'averageGrantSize', 'grantCount']) {
    assert.ok(opp.provenance.missingFields.includes(f), `${f} must be declared missing`);
  }
});

test('source guard: opportunityClient no longer contains Math.random or placeholder names', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  // Compiled tests run from dist/tests; the guarded file is the TS source.
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'agents', 'grantIntelligenceHerald', 'opportunityClient.ts'),
    'utf8'
  );
  assert.ok(!src.includes('Math.random'), 'opportunityClient must not synthesize ids with Math.random');
  assert.ok(!src.includes("'Unknown funder'"), 'opportunityClient must not fabricate a funder name');
  assert.ok(!src.includes("'Program')"), 'opportunityClient must not fabricate a program name');
});

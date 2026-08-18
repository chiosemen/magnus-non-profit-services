/**
 * P0-4 regression — multi-org worker profiles must never fabricate data
 * (SPEC-P0 R4, R5).
 *
 * Before this fix, WorkerService invented city/state ('Unknown'), NTEE code
 * ('Unspecified'), taxYear (current year), zeros for expenses/net assets/
 * headcounts/program ratio, a healthScore of 50, and a filingStatus of
 * 'unknown' that the tool layer then rendered as "✅ Current". Aggregates
 * (combined health score, total employees, net assets) were computed from
 * those fabrications and presented as portfolio truth.
 *
 * These tests exercise the pure mapper/renderer (no database, SPEC-P0 R3)
 * plus source guards that fail on reintroduction of the old fabrications.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  mapOrgRelationsToProfiles,
  aggregateMultiOrgProfile,
} = require('../dist/services/workerProfileMapper');
const {
  renderMultiOrgProfile,
  FIELD_UNAVAILABLE,
} = require('../dist/tools/workers/renderMultiOrgProfile');

const formatCurrency = (n) => `$${n.toLocaleString('en-US')}`;

function rel(ein, name, annualRevenue) {
  return {
    organization: {
      ein,
      name,
      annualRevenue,
      updatedAt: new Date('2026-08-01T00:00:00Z'),
    },
  };
}

test('untracked org fields are null with provenance, never fabricated', () => {
  const [org] = mapOrgRelationsToProfiles([rel('11-1111111', 'Org A', '250000')]);
  assert.equal(org.city, null);
  assert.equal(org.state, null);
  assert.equal(org.nteeCode, null);
  assert.equal(org.taxYear, null);
  assert.equal(org.totalExpenses, null);
  assert.equal(org.netAssets, null);
  assert.equal(org.employeeCount, null);
  assert.equal(org.volunteerCount, null);
  assert.equal(org.programRatio, null);
  assert.equal(org.filingStatus, null);
  assert.equal(org.healthScore, null, 'no data source can justify any health score');
  assert.equal(org.totalRevenue, 250000, 'tracked revenue passes through');
  assert.equal(org.provenance.source, 'prisma:workerOrgRelationship+organization');
  for (const f of ['city', 'state', 'healthScore', 'filingStatus', 'taxYear']) {
    assert.ok(org.provenance.unavailableFields.includes(f), `${f} must be declared unavailable`);
  }
});

test('missing revenue is null and declared, not a truth-bearing zero', () => {
  const [org] = mapOrgRelationsToProfiles([rel('22-2222222', 'Org B', null)]);
  assert.equal(org.totalRevenue, null);
  assert.ok(org.provenance.unavailableFields.includes('totalRevenue'));
});

test('aggregates without a data source are null; revenue sums only real values', () => {
  const orgs = mapOrgRelationsToProfiles([
    rel('11-1111111', 'Org A', '250000'),
    rel('22-2222222', 'Org B', null),
  ]);
  const profile = aggregateMultiOrgProfile({ userId: 'user-1', orgs, formatCurrency });

  assert.equal(profile.totalRevenue, 250000, 'sum over orgs WITH data only');
  assert.equal(profile.totalNetAssets, null);
  assert.equal(profile.totalEmployees, null);
  assert.equal(profile.combinedHealthScore, null, 'previously fabricated as 50');
  assert.equal(profile.provenance.revenueOrgsIncluded, 1);
  assert.equal(profile.provenance.orgCount, 2);
  assert.ok(profile.provenance.unavailableAggregates.includes('combinedHealthScore'));
  assert.equal(profile.alerts.length, 0, 'null filing status must not synthesize alerts');
});

test('all-unknown revenue aggregates to null, not zero', () => {
  const orgs = mapOrgRelationsToProfiles([rel('22-2222222', 'Org B', null)]);
  const profile = aggregateMultiOrgProfile({ userId: 'user-1', orgs, formatCurrency });
  assert.equal(profile.totalRevenue, null);
  assert.ok(profile.provenance.unavailableAggregates.includes('totalRevenue'));
});

test('comparison ranks only orgs with real revenue', () => {
  const orgs = mapOrgRelationsToProfiles([
    rel('11-1111111', 'Org A', '250000'),
    rel('22-2222222', 'Org B', null),
    rel('33-3333333', 'Org C', '900000'),
  ]);
  const profile = aggregateMultiOrgProfile({ userId: 'user-1', orgs, formatCurrency });
  assert.equal(profile.comparisonMetrics.length, 1);
  const metric = profile.comparisonMetrics[0];
  assert.deepEqual(metric.values.map((v) => v.ein).sort(), ['11-1111111', '33-3333333']);
  assert.equal(metric.bestEIN, '33-3333333');
});

test('renderer: null filing status is UNAVAILABLE, never "✅ Current"', () => {
  const orgs = mapOrgRelationsToProfiles([rel('11-1111111', 'Org A', '250000')]);
  const profile = aggregateMultiOrgProfile({ userId: 'user-1', orgs, formatCurrency });
  const output = renderMultiOrgProfile({
    profile,
    userId: 'user-1',
    includeComparison: true,
    formatCurrency,
  });

  const [orgOut] = output.organizations;
  assert.equal(orgOut.filing_status, FIELD_UNAVAILABLE);
  assert.notEqual(orgOut.filing_status, '✅ Current');
  assert.equal(orgOut.location, null);
  assert.equal(orgOut.health_score, null);
  assert.equal(orgOut.program_ratio, null);
  assert.equal(orgOut.tax_year, null);
  assert.equal(output.portfolio_summary.combined_health_score, null);
  assert.equal(output.portfolio_summary.total_net_assets, null);
  assert.ok(orgOut.data_provenance.unavailable_fields.includes('filingStatus'));
  assert.equal(output.data_provenance.revenue_orgs_included, '1 of 1');
});

test('renderer: a real filing status still renders its real label', () => {
  const orgs = mapOrgRelationsToProfiles([rel('11-1111111', 'Org A', '250000')]);
  orgs[0].filingStatus = 'overdue';
  const profile = aggregateMultiOrgProfile({ userId: 'user-1', orgs, formatCurrency });
  const output = renderMultiOrgProfile({
    profile,
    userId: 'user-1',
    includeComparison: false,
    formatCurrency,
  });
  assert.equal(output.organizations[0].filing_status, '🔴 OVERDUE');
  assert.equal(output.alerts.length, 1, 'a REAL overdue status still alerts');
});

// ─── Source guards (fail-before proof anchors, SPEC-P0 R5) ────────────────────

test('source guard: WorkerService no longer fabricates profile fields', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'WorkerService.ts'),
    'utf8'
  );
  assert.ok(!src.includes("city: 'Unknown'"), 'must not fabricate city');
  assert.ok(!src.includes("nteeCode: 'Unspecified'"), 'must not fabricate NTEE code');
  assert.ok(!src.includes('healthScore: 50'), 'must not fabricate a health score');
  assert.ok(!src.includes("filingStatus: 'unknown' as any"), 'must not cast around the filing status contract');
});

test('source guard: the tool no longer renders a blind "✅ Current" fallback', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'tools', 'workers', 'get-multi-org-profile.ts'),
    'utf8'
  );
  assert.ok(
    !src.includes("'✅ Current'"),
    'filing status rendering must go through renderMultiOrgProfile, which maps null to unavailable'
  );
});

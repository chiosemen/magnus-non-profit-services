import test from 'node:test';
import assert from 'node:assert/strict';
import { runFinancialSentinelRules } from '../agents/financialSentinel/rules';

const baseCtx = {
  agentName: 'FinancialSentinel' as const,
  scope: { type: 'org' as const, id: 'org-1' },
  window: { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-10-01T00:00:00Z') },
};

test('flags underspend when elapsed high but spend low', () => {
  const r = runFinancialSentinelRules({
    ctx: baseCtx,
    orgId: 'org-1',
    grants: [
      {
        id: 'g1',
        funderName: 'Late Spender',
        totalAmount: 100_000,
        spentToDate: 5_000,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
      },
    ],
  });
  assert.ok(r.alerts.some(a => a.type === 'GRANT_UNDERSPEND_PACE'));
});

test('restricted funds timing risk triggers when grant ends soon and spend far behind time', () => {
  const r = runFinancialSentinelRules({
    ctx: {
      ...baseCtx,
      window: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-12-01T00:00:00Z') },
    },
    orgId: 'org-1',
    grants: [
      {
        id: 'g4',
        funderName: 'Timing Risk',
        totalAmount: 100_000,
        spentToDate: 5_000, // 5%
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-20T00:00:00Z'), // within 60 days
      },
    ],
  });
  const hit = r.alerts.find(a => a.type === 'RESTRICTED_FUNDS_TIMING_RISK');
  assert.ok(hit);
});

test('flags overspend when ahead of linear pace', () => {
  const r = runFinancialSentinelRules({
    ctx: baseCtx,
    orgId: 'org-1',
    grants: [
      {
        id: 'g2',
        funderName: 'Fast Burn',
        totalAmount: 100_000,
        spentToDate: 95_000,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
      },
    ],
  });
  assert.ok(r.alerts.some(a => a.type === 'GRANT_OVERSPEND_PACE'));
});

test('skips early period grants', () => {
  const r = runFinancialSentinelRules({
    ctx: {
      ...baseCtx,
      window: { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-15T00:00:00Z') },
    },
    orgId: 'org-1',
    grants: [
      {
        id: 'g3',
        funderName: 'New Grant',
        totalAmount: 100_000,
        spentToDate: 1_000,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
      },
    ],
  });
  assert.equal(r.alerts.length, 0);
  assert.ok(r.skippedRules.some(s => s.includes('early_period')));
});

test('skips invalid or negative spend inputs (fail-closed)', () => {
  const r = runFinancialSentinelRules({
    ctx: baseCtx,
    orgId: 'org-1',
    grants: [
      {
        id: 'g_bad_nan',
        funderName: 'Bad Spend NaN',
        totalAmount: 100_000,
        spentToDate: Number.NaN,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
      },
      {
        id: 'g_bad_neg',
        funderName: 'Bad Spend Negative',
        totalAmount: 100_000,
        spentToDate: -5,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
      },
    ],
  });

  assert.equal(r.alerts.length, 0);
  assert.ok(r.skippedRules.includes('grant:g_bad_nan:invalid_spent'));
  assert.ok(r.skippedRules.includes('grant:g_bad_neg:negative_spent'));
});

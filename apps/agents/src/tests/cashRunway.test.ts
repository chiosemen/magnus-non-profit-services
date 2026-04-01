import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCashRunway } from '../agents/financialSentinel/cashRunway';

test('computeCashRunway returns null runway when net is non-negative', () => {
  const r = computeCashRunway({ cashBalanceUsd: 10000, avgMonthlyNetUsd: 500 });
  assert.equal(r.runwayMonths, null);
  assert.equal(r.burnRateUsdPerMonth, 0);
});

test('computeCashRunway computes runway months when burning', () => {
  const r = computeCashRunway({ cashBalanceUsd: 12000, avgMonthlyNetUsd: -3000 });
  assert.ok(r.runwayMonths !== null);
  assert.ok(Math.abs((r.runwayMonths ?? 0) - 4) < 0.0001);
  assert.equal(r.burnRateUsdPerMonth, 3000);
});


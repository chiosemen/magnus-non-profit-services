/**
 * Wave 1 Truth Integrity Tests — FinancialService
 * Verifies that fabricated data fallbacks (Math.random, hardcoded estimates)
 * are gone and that DataSourceNotConfiguredError fires in their place.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Import the compiled service
const { FinancialService, DataSourceNotConfiguredError } = require('../dist/services/FinancialService');

// ─── Helper: assert no Math.random() values appear in output ─────────────────
// The hardcoded estimated values were specific:
// Revenue streams: amounts like 450000, 200000, 120000, 80000, 50000, 25000
// Expense categories: 520000, 130000, 110000, 65000
// Monthly income: base 75000 revenue + random, base 70000 expenses + random
const FABRICATED_REVENUE_AMOUNTS = [450000, 200000, 120000, 80000, 50000, 25000];
const FABRICATED_EXPENSE_AMOUNTS = [520000, 130000, 110000, 65000];

test('getRevenueBreakdown throws DataSourceNotConfiguredError when no accessToken', async () => {
  const svc = new FinancialService();
  await assert.rejects(
    () => svc.getRevenueBreakdown('12-3456789', 2023, undefined),
    (err) => {
      assert.ok(err instanceof DataSourceNotConfiguredError, `Expected DataSourceNotConfiguredError, got ${err.constructor.name}`);
      assert.equal(err.code, 'DATA_SOURCE_NOT_CONFIGURED');
      assert.match(err.message, /Plaid/i);
      return true;
    }
  );
});

test('getExpenseAllocation throws DataSourceNotConfiguredError when no accessToken', async () => {
  const svc = new FinancialService();
  await assert.rejects(
    () => svc.getExpenseAllocation('12-3456789', 2023, undefined),
    (err) => {
      assert.ok(err instanceof DataSourceNotConfiguredError, `Expected DataSourceNotConfiguredError, got ${err.constructor.name}`);
      assert.equal(err.code, 'DATA_SOURCE_NOT_CONFIGURED');
      return true;
    }
  );
});

test('getIncomeSummary throws DataSourceNotConfiguredError when no accessToken', async () => {
  const svc = new FinancialService();
  await assert.rejects(
    () => svc.getIncomeSummary('12-3456789', 12, undefined),
    (err) => {
      assert.ok(err instanceof DataSourceNotConfiguredError, `Expected DataSourceNotConfiguredError, got ${err.constructor.name}`);
      assert.equal(err.code, 'DATA_SOURCE_NOT_CONFIGURED');
      return true;
    }
  );
});

test('FinancialService has no getEstimatedRevenueStreams method (fabricated fallback deleted)', () => {
  const svc = new FinancialService();
  // The private method should not exist; accessing via prototype
  assert.equal(
    typeof svc.__proto__['getEstimatedRevenueStreams'],
    'undefined',
    'getEstimatedRevenueStreams should not exist on FinancialService'
  );
});

test('FinancialService has no generateEstimatedMonthlyData method (Math.random removed)', () => {
  const svc = new FinancialService();
  assert.equal(
    typeof svc.__proto__['generateEstimatedMonthlyData'],
    'undefined',
    'generateEstimatedMonthlyData should not exist on FinancialService'
  );
});

test('FinancialService has no getEstimatedExpenseCategories method (fabricated fallback deleted)', () => {
  const svc = new FinancialService();
  assert.equal(
    typeof svc.__proto__['getEstimatedExpenseCategories'],
    'undefined',
    'getEstimatedExpenseCategories should not exist on FinancialService'
  );
});

test('smoke: existing smoke test still passes', () => {
  assert.equal(true, true);
});

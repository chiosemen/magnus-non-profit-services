import { monthlyVolatility, runWorkerIncomeOptimizerRules, topSourcePct } from '../agents/workerIncomeOptimizer/rules';
import test from 'node:test';
import assert from 'node:assert/strict';

function ctx() {
  return {
    agentName: 'WorkerIncomeOptimizer' as const,
    scope: { type: 'worker' as const, id: '00000000-0000-0000-0000-000000000002' },
    window: { start: new Date('2026-02-06T09:00:00.000Z'), end: new Date('2026-02-13T09:00:00.000Z') },
  };
}

test('volatility calculation returns cv > 0.30 for spiky income', () => {
  const end = new Date('2026-02-13T09:00:00.000Z');
  const tx = [
    { amount: 1000, transactionDate: new Date('2025-09-15T00:00:00Z'), sourceOrgId: null },
    { amount: 1000, transactionDate: new Date('2025-10-15T00:00:00Z'), sourceOrgId: null },
    { amount: 1000, transactionDate: new Date('2025-11-15T00:00:00Z'), sourceOrgId: null },
    { amount: 1000, transactionDate: new Date('2025-12-15T00:00:00Z'), sourceOrgId: null },
    { amount: 1000, transactionDate: new Date('2026-01-15T00:00:00Z'), sourceOrgId: null },
    { amount: 10000, transactionDate: new Date('2026-02-01T00:00:00Z'), sourceOrgId: null },
  ];
  const { cv } = monthlyVolatility(tx, end);
  assert.ok(cv > 0.30);
});

test('concentration detection identifies >60% top source', () => {
  const top = topSourcePct([
    { amount: 700, transactionDate: new Date(), sourceOrgId: 'orgA' },
    { amount: 200, transactionDate: new Date(), sourceOrgId: 'orgB' },
    { amount: 100, transactionDate: new Date(), sourceOrgId: 'orgB' },
  ]);
  assert.ok(Math.abs(top.pct - 0.7) < 1e-9);
  assert.equal(top.topSourceOrgId, 'orgA');
});

test('tax shortfall triggers when projected > paid*1.2', () => {
  const res = runWorkerIncomeOptimizerRules({
    ctx: ctx(),
    workerId: '00000000-0000-0000-0000-000000000002',
    transactions90d: [
      { amount: 9000, transactionDate: new Date('2026-02-01T00:00:00Z'), sourceOrgId: 'orgA' },
    ],
    transactions180d: [
      { amount: 9000, transactionDate: new Date('2026-02-01T00:00:00Z'), sourceOrgId: 'orgA' },
      { amount: 9000, transactionDate: new Date('2026-01-01T00:00:00Z'), sourceOrgId: 'orgA' },
    ],
    taxEstimates: [
      {
        taxYear: 2026,
        quarter: 1,
        estimatedFederal: 1000,
        estimatedState: 200,
        paidFederal: 100,
        paidState: 20,
        dueDate: new Date('2026-04-15T00:00:00Z'),
      },
    ],
  });
  assert.equal(res.alerts.some(a => a.type === 'TAX_SHORTFALL'), true);
});

test('due reminder triggers within 14 days when paidFederal < estimatedFederal', () => {
  const end = new Date('2026-04-05T09:00:00.000Z');
  const res = runWorkerIncomeOptimizerRules({
    ctx: {
      agentName: 'WorkerIncomeOptimizer' as const,
      scope: { type: 'worker' as const, id: 'w' },
      window: { start: new Date('2026-03-29T09:00:00.000Z'), end },
    },
    workerId: 'w',
    transactions90d: [{ amount: 1000, transactionDate: new Date('2026-04-01T00:00:00Z'), sourceOrgId: null }],
    transactions180d: [
      { amount: 1000, transactionDate: new Date('2026-01-01T00:00:00Z'), sourceOrgId: null },
      { amount: 1000, transactionDate: new Date('2026-02-01T00:00:00Z'), sourceOrgId: null },
    ],
    taxEstimates: [
      {
        taxYear: 2026,
        quarter: 1,
        estimatedFederal: 500,
        estimatedState: 100,
        paidFederal: 0,
        paidState: 0,
        dueDate: new Date('2026-04-15T00:00:00Z'),
      },
    ],
  });
  assert.equal(res.alerts.some(a => a.type === 'QUARTERLY_TAX_DUE'), true);
});

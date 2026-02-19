import test from 'node:test';
import assert from 'node:assert/strict';
import { runGrantLifecycleRules } from '../agents/grantLifecycleManager/rules';

function ctx(end: Date) {
  return {
    agentName: 'GrantLifecycleManager' as const,
    scope: { type: 'grant' as const, id: '00000000-0000-0000-0000-000000000003' },
    window: { start: new Date(2026, 1, 12, 9, 30, 0, 0), end },
  };
}

function addDaysLocal(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), 0, 0);
}

test('renewal planning triggers on exact 180-day boundary', () => {
  const end = new Date(2026, 1, 13, 9, 30, 0, 0);
  const res = runGrantLifecycleRules({
    ctx: ctx(end),
    grant: {
      id: 'g1',
      orgId: 'o1',
      funderName: 'Funder',
      totalAmount: 1000,
      spentToDate: 200,
      startDate: addDaysLocal(end, -10),
      endDate: addDaysLocal(end, 180),
      reportingSchedule: [],
    },
    workerIds: [],
  });
  assert.equal(res.alerts.some(a => a.type === 'GRANT_RENEWAL_PLANNING' && a.scopeType === 'org'), true);
});

test('worker runway fans out POSITION_ENDING_SOON on exact 270-day boundary', () => {
  const end = new Date(2026, 1, 13, 9, 30, 0, 0);
  const res = runGrantLifecycleRules({
    ctx: ctx(end),
    grant: {
      id: 'g2',
      orgId: 'o1',
      funderName: 'Funder',
      totalAmount: 1000,
      spentToDate: 200,
      startDate: addDaysLocal(end, -10),
      endDate: addDaysLocal(end, 270),
      reportingSchedule: [],
    },
    workerIds: ['w1', 'w2'],
  });
  const workerAlerts = res.alerts.filter(a => a.type === 'POSITION_ENDING_SOON' && a.scopeType === 'worker');
  assert.equal(workerAlerts.length, 2);
  assert.deepEqual(new Set(workerAlerts.map(a => a.scopeId)), new Set(['w1', 'w2']));
});

test('underspending opportunity triggers when spending pace < time pace * 0.8', () => {
  const end = new Date(2026, 1, 13, 9, 30, 0, 0);
  const res = runGrantLifecycleRules({
    ctx: ctx(end),
    grant: {
      id: 'g3',
      orgId: 'o1',
      funderName: 'Funder',
      totalAmount: 1000,
      spentToDate: 200,
      startDate: addDaysLocal(end, -50),
      endDate: addDaysLocal(end, 50),
      reportingSchedule: [],
    },
    workerIds: [],
  });
  assert.equal(res.alerts.some(a => a.type === 'GRANT_UNDERSPEND_OPPORTUNITY' && a.scopeType === 'org'), true);
  assert.equal(typeof res.metrics.timeRemainingDays, 'number');
  assert.equal(typeof res.metrics.spendingPace, 'number');
  assert.equal(typeof res.metrics.timePace, 'number');
});

test('report deadline alert triggers when reportingSchedule has a deadline within 30 days', () => {
  const end = new Date(2026, 1, 13, 9, 30, 0, 0);
  const res = runGrantLifecycleRules({
    ctx: ctx(end),
    grant: {
      id: 'g4',
      orgId: 'o1',
      funderName: 'Funder',
      totalAmount: 1000,
      spentToDate: 200,
      startDate: addDaysLocal(end, -10),
      endDate: addDaysLocal(end, 200),
      reportingSchedule: {
        deadlines: [{ title: 'Interim Report', dueDate: addDaysLocal(end, 10).toISOString() }],
      },
    },
    workerIds: [],
  });
  assert.equal(res.alerts.some(a => a.type === 'GRANT_REPORT_DEADLINE_UPCOMING' && a.scopeType === 'org'), true);
});

test('grant end imminent triggers org HIGH and worker HIGH within 30 days', () => {
  const end = new Date(2026, 1, 13, 9, 30, 0, 0);
  const res = runGrantLifecycleRules({
    ctx: ctx(end),
    grant: {
      id: 'g5',
      orgId: 'o1',
      funderName: 'Funder',
      totalAmount: 1000,
      spentToDate: 200,
      startDate: addDaysLocal(end, -10),
      endDate: addDaysLocal(end, 20),
      reportingSchedule: [],
    },
    workerIds: ['w1'],
  });
  assert.equal(res.alerts.some(a => a.type === 'GRANT_END_IMMINENT' && a.scopeType === 'org' && a.severity === 'HIGH'), true);
  assert.equal(res.alerts.some(a => a.type === 'POSITION_ENDING_SOON' && a.scopeType === 'worker' && a.severity === 'HIGH'), true);
});

test('dedupe keys are stable for same window end', () => {
  const end = new Date(2026, 1, 13, 9, 30, 0, 0);
  const run = () =>
    runGrantLifecycleRules({
      ctx: ctx(end),
      grant: {
        id: 'g6',
        orgId: 'o1',
        funderName: 'Funder',
        totalAmount: 1000,
        spentToDate: 200,
        startDate: addDaysLocal(end, -10),
        endDate: addDaysLocal(end, 180),
        reportingSchedule: [],
      },
      workerIds: [],
    });

  const a = run().alerts.find(x => x.type === 'GRANT_RENEWAL_PLANNING')!;
  const b = run().alerts.find(x => x.type === 'GRANT_RENEWAL_PLANNING')!;
  assert.equal(a.dedupeKey, b.dedupeKey);
});

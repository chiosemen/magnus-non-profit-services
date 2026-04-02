import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isComplianceDueSoonNotFiled,
  isComplianceOverdueNotFiled,
  partitionComplianceCalendarRows,
  PORTFOLIO_CONTROL_TOWER_NAV_PRESETS,
} from '../portfolioAccountability';

const now = new Date('2026-06-15T12:00:00.000Z');
const dueSoonDays = 30;

test('partitionComplianceCalendarRows: empty', () => {
  const out = partitionComplianceCalendarRows([], now, dueSoonDays);
  assert.deepEqual(out, { totalRows: 0, overdueNotFiled: 0, dueSoonNotFiled: 0 });
});

test('partitionComplianceCalendarRows: all FILED yields zero overdue and due soon', () => {
  const rows = [
    { dueDate: new Date('2025-01-01T00:00:00.000Z'), status: 'FILED' },
    { dueDate: new Date('2020-01-01T00:00:00.000Z'), status: 'FILED' },
  ];
  const out = partitionComplianceCalendarRows(rows, now, dueSoonDays);
  assert.equal(out.totalRows, 2);
  assert.equal(out.overdueNotFiled, 0);
  assert.equal(out.dueSoonNotFiled, 0);
});

test('partitionComplianceCalendarRows: overdue not filed', () => {
  const rows = [{ dueDate: new Date('2026-06-01T00:00:00.000Z'), status: 'PENDING' }];
  const out = partitionComplianceCalendarRows(rows, now, dueSoonDays);
  assert.equal(out.overdueNotFiled, 1);
  assert.equal(out.dueSoonNotFiled, 0);
});

test('partitionComplianceCalendarRows: due soon within horizon and window start', () => {
  const rows = [{ dueDate: new Date('2026-06-20T00:00:00.000Z'), status: 'PENDING' }];
  const out = partitionComplianceCalendarRows(rows, now, dueSoonDays);
  assert.equal(out.overdueNotFiled, 0);
  assert.equal(out.dueSoonNotFiled, 1);
});

test('partitionComplianceCalendarRows: far future not due soon', () => {
  const rows = [{ dueDate: new Date('2027-01-01T00:00:00.000Z'), status: 'PENDING' }];
  const out = partitionComplianceCalendarRows(rows, now, dueSoonDays);
  assert.equal(out.overdueNotFiled, 0);
  assert.equal(out.dueSoonNotFiled, 0);
});

test('partitionComplianceCalendarRows: mixed', () => {
  const rows = [
    { dueDate: new Date('2026-01-01T00:00:00.000Z'), status: 'PENDING' },
    { dueDate: new Date('2026-06-20T00:00:00.000Z'), status: 'PENDING' },
    { dueDate: new Date('2027-01-01T00:00:00.000Z'), status: 'PENDING' },
    { dueDate: new Date('2026-06-14T00:00:00.000Z'), status: 'FILED' },
  ];
  const out = partitionComplianceCalendarRows(rows, now, dueSoonDays);
  assert.equal(out.totalRows, 4);
  assert.equal(out.overdueNotFiled, 1);
  assert.equal(out.dueSoonNotFiled, 1);
});

test('isComplianceOverdueNotFiled: FILED never overdue', () => {
  assert.equal(
    isComplianceOverdueNotFiled(
      { dueDate: new Date('2020-01-01T00:00:00.000Z'), status: 'FILED' },
      now,
    ),
    false,
  );
});

test('isComplianceDueSoonNotFiled: excludes overdue rows', () => {
  const overdue = { dueDate: new Date('2026-01-01T00:00:00.000Z'), status: 'PENDING' };
  assert.equal(isComplianceDueSoonNotFiled(overdue, now, dueSoonDays), false);
});

test('partition counts match filter parity with helpers', () => {
  const rows = [
    { dueDate: new Date('2026-01-01T00:00:00.000Z'), status: 'PENDING' },
    { dueDate: new Date('2026-06-20T00:00:00.000Z'), status: 'PENDING' },
    { dueDate: new Date('2027-01-01T00:00:00.000Z'), status: 'PENDING' },
    { dueDate: new Date('2026-06-14T00:00:00.000Z'), status: 'FILED' },
  ];
  const part = partitionComplianceCalendarRows(rows, now, dueSoonDays);
  const overdueCount = rows.filter(c => isComplianceOverdueNotFiled(c, now)).length;
  const dueSoonCount = rows.filter(
    c => !isComplianceOverdueNotFiled(c, now) && isComplianceDueSoonNotFiled(c, now, dueSoonDays),
  ).length;
  assert.equal(part.overdueNotFiled, overdueCount);
  assert.equal(part.dueSoonNotFiled, dueSoonCount);
});

test('PORTFOLIO_CONTROL_TOWER_NAV_PRESETS has stable ids and paths', () => {
  assert.ok(PORTFOLIO_CONTROL_TOWER_NAV_PRESETS.length >= 4);
  const ids = new Set(PORTFOLIO_CONTROL_TOWER_NAV_PRESETS.map(p => p.id));
  assert.equal(ids.size, PORTFOLIO_CONTROL_TOWER_NAV_PRESETS.length);
  for (const p of PORTFOLIO_CONTROL_TOWER_NAV_PRESETS) {
    assert.ok(p.path === 'alerts' || p.path === 'runs');
    assert.ok(p.query.scopeType === 'ORG');
  }
});

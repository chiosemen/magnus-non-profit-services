import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveVolunteerOpsModuleState } from '../volunteerOpsModule';

const now = new Date('2026-04-01T12:00:00.000Z');

test('deriveVolunteerOpsModuleState: NOT_CONFIGURED when zero events', () => {
  const out = deriveVolunteerOpsModuleState({
    eventCount: 0,
    totalHours: 0,
    oldestOccurredAt: null,
    newestOccurredAt: null,
    now,
  });
  assert.equal(out.state, 'NOT_CONFIGURED');
  assert.match(out.summary, /No volunteer time entries/);
  assert.deepEqual(out.counts, { events: 0, spanDays: 0, totalHours: 0 });
});

test('deriveVolunteerOpsModuleState: OK when at least 3 events', () => {
  const out = deriveVolunteerOpsModuleState({
    eventCount: 3,
    totalHours: 7.5,
    oldestOccurredAt: new Date('2026-01-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-01-02T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'OK');
  assert.match(out.summary, /3 recorded time/);
  assert.equal(out.counts.totalHours, 7.5);
});

test('deriveVolunteerOpsModuleState: OK when 2 events span >= 28 days', () => {
  const out = deriveVolunteerOpsModuleState({
    eventCount: 2,
    totalHours: 4,
    oldestOccurredAt: new Date('2026-01-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-02-01T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'OK');
  assert.ok(out.counts.spanDays >= 28);
});

test('deriveVolunteerOpsModuleState: INSUFFICIENT_DATA when sparse', () => {
  const out = deriveVolunteerOpsModuleState({
    eventCount: 2,
    totalHours: 3,
    oldestOccurredAt: new Date('2026-03-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-03-02T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'INSUFFICIENT_DATA');
  assert.match(out.summary, /below thresholds/);
});

test('deriveVolunteerOpsModuleState: single entry is insufficient for OK', () => {
  const out = deriveVolunteerOpsModuleState({
    eventCount: 1,
    totalHours: 2,
    oldestOccurredAt: new Date('2026-03-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-03-01T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'INSUFFICIENT_DATA');
});

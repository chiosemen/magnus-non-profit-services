import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDonorOpsModuleState } from '../donorOpsModule';

const now = new Date('2026-04-01T12:00:00.000Z');

test('deriveDonorOpsModuleState: NOT_CONFIGURED when no Stripe and zero events', () => {
  const out = deriveDonorOpsModuleState({
    stripeAccountId: null,
    eventCount: 0,
    oldestOccurredAt: null,
    newestOccurredAt: null,
    now,
  });
  assert.equal(out.state, 'NOT_CONFIGURED');
  assert.match(out.summary, /No Stripe account linked/);
});

test('deriveDonorOpsModuleState: INSUFFICIENT_DATA when Stripe linked but zero events', () => {
  const out = deriveDonorOpsModuleState({
    stripeAccountId: 'acct_123',
    eventCount: 0,
    oldestOccurredAt: null,
    newestOccurredAt: null,
    now,
  });
  assert.equal(out.state, 'INSUFFICIENT_DATA');
  assert.match(out.summary, /Stripe is linked but no donor events/);
});

test('deriveDonorOpsModuleState: OK when at least 3 events (no Stripe)', () => {
  const out = deriveDonorOpsModuleState({
    stripeAccountId: null,
    eventCount: 3,
    oldestOccurredAt: new Date('2026-01-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-01-02T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'OK');
  assert.equal(out.counts.events, 3);
});

test('deriveDonorOpsModuleState: OK when 2 events span >= 28 days', () => {
  const out = deriveDonorOpsModuleState({
    stripeAccountId: null,
    eventCount: 2,
    oldestOccurredAt: new Date('2026-01-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-02-01T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'OK');
  assert.ok(out.counts.spanDays >= 28);
});

test('deriveDonorOpsModuleState: INSUFFICIENT_DATA when sparse (2 events, short span)', () => {
  const out = deriveDonorOpsModuleState({
    stripeAccountId: 'acct_123',
    eventCount: 2,
    oldestOccurredAt: new Date('2026-03-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-03-02T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'INSUFFICIENT_DATA');
  assert.match(out.summary, /below thresholds/);
});

test('deriveDonorOpsModuleState: manual path without Stripe — 1 event is insufficient', () => {
  const out = deriveDonorOpsModuleState({
    stripeAccountId: null,
    eventCount: 1,
    oldestOccurredAt: new Date('2026-03-01T00:00:00.000Z'),
    newestOccurredAt: new Date('2026-03-01T00:00:00.000Z'),
    now,
  });
  assert.equal(out.state, 'INSUFFICIENT_DATA');
});

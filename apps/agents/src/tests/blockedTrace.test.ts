import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAutonomyBlockedTrace } from '../autonomy/blockedTrace';

test('extractAutonomyBlockedTrace parses handoff tier_c', () => {
  const t = extractAutonomyBlockedTrace(new Error('AUTONOMY_BLOCKED:handoff:tier_c_never'));
  assert.deepEqual(t, {
    decision: 'BLOCKED_INTERNAL_EFFECT',
    effect: 'handoff',
    reasonCode: 'tier_c_never',
  });
});

test('extractAutonomyBlockedTrace parses memory ask_first', () => {
  const t = extractAutonomyBlockedTrace(new Error('AUTONOMY_BLOCKED:memory:ask_first_requires_review'));
  assert.deepEqual(t, {
    decision: 'BLOCKED_INTERNAL_EFFECT',
    effect: 'memory',
    reasonCode: 'ask_first_requires_review',
  });
});

test('extractAutonomyBlockedTrace returns null for other errors', () => {
  assert.equal(extractAutonomyBlockedTrace(new Error('OTHER')), null);
  assert.equal(extractAutonomyBlockedTrace('x'), null);
});

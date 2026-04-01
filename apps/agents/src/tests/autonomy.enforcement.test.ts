import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertInternalSideEffectAllowed,
  effectiveBoundaryMode,
  stampCtxForBoundary,
} from '../autonomy/enforcement';

test('effectiveBoundaryMode respects org maxAutonomyTier cap', () => {
  assert.equal(
    effectiveBoundaryMode({ defaultMode: 'internal_only', maxAutonomyTier: 'TIER_B_ASK_FIRST' }),
    'ask_first',
  );
  assert.equal(
    effectiveBoundaryMode({ defaultMode: 'ask_first', maxAutonomyTier: 'TIER_A_AUTONOMOUS' }),
    'ask_first',
  );
  assert.equal(
    effectiveBoundaryMode({ defaultMode: 'internal_only', maxAutonomyTier: 'TIER_C_NEVER' }),
    'never',
  );
});

test('stampCtxForBoundary maps boundary to autonomyTier + requiresHumanReview', () => {
  assert.deepEqual(stampCtxForBoundary({ mode: 'internal_only' }), {
    autonomyTier: 'TIER_A_AUTONOMOUS',
    requiresHumanReview: false,
  });
  assert.deepEqual(stampCtxForBoundary({ mode: 'ask_first' }), {
    autonomyTier: 'TIER_B_ASK_FIRST',
    requiresHumanReview: true,
  });
  assert.deepEqual(stampCtxForBoundary({ mode: 'never' }), {
    autonomyTier: 'TIER_C_NEVER',
    requiresHumanReview: true,
  });
});

test('assertInternalSideEffectAllowed blocks tier C and enforces ask-first review flag', () => {
  assert.throws(
    () => assertInternalSideEffectAllowed({ autonomyTier: 'TIER_C_NEVER', requiresHumanReview: true, effect: 'handoff' }),
    /AUTONOMY_BLOCKED:handoff:tier_c_never/,
  );
  assert.throws(
    () => assertInternalSideEffectAllowed({ autonomyTier: 'TIER_B_ASK_FIRST', requiresHumanReview: false, effect: 'memory' }),
    /AUTONOMY_BLOCKED:memory:ask_first_requires_review/,
  );
  assert.doesNotThrow(() =>
    assertInternalSideEffectAllowed({ autonomyTier: 'TIER_B_ASK_FIRST', requiresHumanReview: true, effect: 'handoff' }),
  );
});


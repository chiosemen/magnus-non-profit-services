import type { AutonomyTier } from '@magnus/db/types';

export type BoundaryMode = 'internal_only' | 'ask_first' | 'never';

export function effectiveBoundaryMode(params: {
  defaultMode: BoundaryMode;
  maxAutonomyTier: AutonomyTier;
}): BoundaryMode {
  const { defaultMode, maxAutonomyTier } = params;
  if (maxAutonomyTier === 'TIER_C_NEVER') return 'never';
  if (maxAutonomyTier === 'TIER_B_ASK_FIRST') {
    if (defaultMode === 'internal_only') return 'ask_first';
    return defaultMode; // ask_first or never
  }
  return defaultMode;
}

export function stampCtxForBoundary(params: {
  mode: BoundaryMode;
}): { autonomyTier: AutonomyTier; requiresHumanReview: boolean } {
  if (params.mode === 'never') return { autonomyTier: 'TIER_C_NEVER', requiresHumanReview: true };
  if (params.mode === 'ask_first') return { autonomyTier: 'TIER_B_ASK_FIRST', requiresHumanReview: true };
  return { autonomyTier: 'TIER_A_AUTONOMOUS', requiresHumanReview: false };
}

export function assertInternalSideEffectAllowed(params: {
  autonomyTier: AutonomyTier | undefined;
  requiresHumanReview: boolean | undefined;
  effect: 'handoff' | 'memory';
}): void {
  const tier = params.autonomyTier ?? 'TIER_A_AUTONOMOUS';
  const review = params.requiresHumanReview ?? false;
  if (tier === 'TIER_C_NEVER') throw new Error(`AUTONOMY_BLOCKED:${params.effect}:tier_c_never`);
  if (tier === 'TIER_B_ASK_FIRST' && !review) throw new Error(`AUTONOMY_BLOCKED:${params.effect}:ask_first_requires_review`);
}


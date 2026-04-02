/**
 * Maps `assertInternalSideEffectAllowed` throws to structured run metrics (no fabricated approvals).
 * Error shape: `AUTONOMY_BLOCKED:<effect>:<reasonCode>`
 */
export function extractAutonomyBlockedTrace(err: unknown): {
  decision: 'BLOCKED_INTERNAL_EFFECT';
  effect: string;
  reasonCode: string;
} | null {
  if (!(err instanceof Error)) return null;
  const m = err.message;
  if (!m.startsWith('AUTONOMY_BLOCKED:')) return null;
  const rest = m.slice('AUTONOMY_BLOCKED:'.length);
  const colon = rest.indexOf(':');
  if (colon === -1) {
    return { decision: 'BLOCKED_INTERNAL_EFFECT', effect: rest || 'unknown', reasonCode: '' };
  }
  return {
    decision: 'BLOCKED_INTERNAL_EFFECT',
    effect: rest.slice(0, colon),
    reasonCode: rest.slice(colon + 1),
  };
}

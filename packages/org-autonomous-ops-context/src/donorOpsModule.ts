import type { ModuleStateCode } from './executiveSemantics';

/**
 * Executive donor_ops classification — deterministic, DB-backed only.
 *
 * - NOT_CONFIGURED: no Stripe Connect id on the org and zero DonorEvent rows.
 * - OK: at least 3 events, OR at least 2 events with >= 28 days between earliest and latest occurredAt.
 * - INSUFFICIENT_DATA: otherwise (e.g. Stripe linked but no events, or sparse history below OK thresholds).
 *
 * spanDays = floor((newestOccurredAt - oldestOccurredAt) / 86400000) when both exist; with a single row, min === max → 0.
 */
const MIN_EVENTS_FOR_OK = 3;
const MIN_EVENTS_FOR_SPAN_OK = 2;
const MIN_SPAN_DAYS_FOR_OK = 28;
const MS_PER_DAY = 86400000;

export type DeriveDonorOpsModuleStateInput = {
  stripeAccountId: string | null | undefined;
  eventCount: number;
  oldestOccurredAt: Date | null;
  newestOccurredAt: Date | null;
  /** Reserved for tests / future time-aware rules; currently unused. */
  now: Date;
};

export type DonorOpsModuleDerived = {
  state: ModuleStateCode;
  summary: string;
  counts: Record<string, number>;
};

export function deriveDonorOpsModuleState(input: DeriveDonorOpsModuleStateInput): DonorOpsModuleDerived {
  void input.now;
  const stripeLinked = Boolean(input.stripeAccountId && String(input.stripeAccountId).trim().length > 0);
  const n = input.eventCount;

  let spanDays = 0;
  if (input.oldestOccurredAt && input.newestOccurredAt) {
    spanDays = Math.floor(
      (input.newestOccurredAt.getTime() - input.oldestOccurredAt.getTime()) / MS_PER_DAY,
    );
  }

  const counts: Record<string, number> = {
    events: n,
    spanDays,
    stripeLinked: stripeLinked ? 1 : 0,
  };

  if (!stripeLinked && n === 0) {
    return {
      state: 'NOT_CONFIGURED',
      summary:
        'No Stripe account linked and no donor events on record. Link payments (Stripe) or append donor events via the API.',
      counts,
    };
  }

  const okByCount = n >= MIN_EVENTS_FOR_OK;
  const okBySpan = n >= MIN_EVENTS_FOR_SPAN_OK && spanDays >= MIN_SPAN_DAYS_FOR_OK;
  if (okByCount || okBySpan) {
    return {
      state: 'OK',
      summary: `Donor ops: ${n} recorded gift event(s) in the ledger.`,
      counts,
    };
  }

  if (stripeLinked && n === 0) {
    return {
      state: 'INSUFFICIENT_DATA',
      summary: 'Stripe is linked but no donor events are recorded yet.',
      counts,
    };
  }

  return {
    state: 'INSUFFICIENT_DATA',
    summary: `Donor event history is below thresholds (need at least ${MIN_EVENTS_FOR_OK} events, or at least ${MIN_EVENTS_FOR_SPAN_OK} events spanning ${MIN_SPAN_DAYS_FOR_OK} days).`,
    counts,
  };
}

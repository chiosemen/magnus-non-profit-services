import type { ModuleStateCode } from './executiveSemantics';

/**
 * Executive volunteer_ops classification — deterministic, VolunteerEvent ledger only.
 *
 * No roster deduplication or donor-style external rail: empty ledger means NOT_CONFIGURED.
 *
 * - NOT_CONFIGURED: zero VolunteerEvent rows.
 * - OK: at least 3 events, OR at least 2 events with >= 28 days between earliest and latest occurredAt.
 * - INSUFFICIENT_DATA: otherwise (sparse history below OK thresholds).
 *
 * In-kind volunteer valuation is out of scope; this module reflects **time entries** only.
 */
const MIN_EVENTS_FOR_OK = 3;
const MIN_EVENTS_FOR_SPAN_OK = 2;
const MIN_SPAN_DAYS_FOR_OK = 28;
const MS_PER_DAY = 86400000;

export type DeriveVolunteerOpsModuleStateInput = {
  eventCount: number;
  /** Sum of hours from the ledger (deterministic aggregate); 0 when no rows. */
  totalHours: number;
  oldestOccurredAt: Date | null;
  newestOccurredAt: Date | null;
  /** Reserved for tests / future time-aware rules. */
  now: Date;
};

export type VolunteerOpsModuleDerived = {
  state: ModuleStateCode;
  summary: string;
  counts: Record<string, number>;
};

function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

export function deriveVolunteerOpsModuleState(input: DeriveVolunteerOpsModuleStateInput): VolunteerOpsModuleDerived {
  void input.now;
  const n = input.eventCount;
  const totalH = roundHours(input.totalHours);

  let spanDays = 0;
  if (input.oldestOccurredAt && input.newestOccurredAt) {
    spanDays = Math.floor(
      (input.newestOccurredAt.getTime() - input.oldestOccurredAt.getTime()) / MS_PER_DAY,
    );
  }

  const counts: Record<string, number> = {
    events: n,
    spanDays,
    totalHours: totalH,
  };

  if (n === 0) {
    return {
      state: 'NOT_CONFIGURED',
      summary:
        'No volunteer time entries on record. Append VolunteerEvent rows via the API or ingestion; this rollup is time-ledger only (not in-kind valuation or scheduling).',
      counts,
    };
  }

  const okByCount = n >= MIN_EVENTS_FOR_OK;
  const okBySpan = n >= MIN_EVENTS_FOR_SPAN_OK && spanDays >= MIN_SPAN_DAYS_FOR_OK;
  if (okByCount || okBySpan) {
    return {
      state: 'OK',
      summary: `Volunteer ops: ${n} recorded time entr${n === 1 ? 'y' : 'ies'}, ${totalH} total hours in the ledger.`,
      counts,
    };
  }

  return {
    state: 'INSUFFICIENT_DATA',
    summary: `Volunteer time history is below thresholds (${n} entr${n === 1 ? 'y' : 'ies'}, ${totalH} hours; need at least ${MIN_EVENTS_FOR_OK} entries, or at least ${MIN_EVENTS_FOR_SPAN_OK} entries spanning ${MIN_SPAN_DAYS_FOR_OK} days).`,
    counts,
  };
}

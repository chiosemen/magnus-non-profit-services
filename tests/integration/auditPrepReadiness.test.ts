import { describe, expect, it } from 'vitest';
import { buildAuditPrepReadinessSummary } from '../../apps/org-dashboard-api/src/orgAuditPrepService';

const now = new Date('2026-03-30T12:00:00.000Z');

describe('buildAuditPrepReadinessSummary', () => {
  it('returns no_items when there are no rows', () => {
    const s = buildAuditPrepReadinessSummary([], now);
    expect(s).toMatchObject({
      totalItems: 0,
      openItems: 0,
      blockedItems: 0,
      overdueItems: 0,
      overallStatus: 'no_items',
    });
    expect(s.explanation[0]).toContain('apply the checklist template');
  });

  it('counts open, blocked, and overdue using UTC start-of-day', () => {
    const s = buildAuditPrepReadinessSummary(
      [
        { status: 'COMPLETE', targetDate: new Date('2026-03-01T00:00:00.000Z') },
        { status: 'IN_PROGRESS', targetDate: new Date('2026-03-29T00:00:00.000Z') },
        { status: 'NOT_STARTED', targetDate: new Date('2026-03-29T23:59:59.999Z') },
        { status: 'BLOCKED', targetDate: new Date('2026-04-01T00:00:00.000Z') },
      ],
      now
    );
    expect(s.totalItems).toBe(4);
    expect(s.openItems).toBe(3);
    expect(s.blockedItems).toBe(1);
    expect(s.overdueItems).toBe(2);
    expect(s.overallStatus).toBe('blocked');
  });

  it('blocked takes precedence over overdue', () => {
    const s = buildAuditPrepReadinessSummary(
      [
        { status: 'BLOCKED', targetDate: new Date('2026-01-01T00:00:00.000Z') },
        { status: 'IN_PROGRESS', targetDate: new Date('2026-01-01T00:00:00.000Z') },
      ],
      now
    );
    expect(s.overallStatus).toBe('blocked');
    expect(s.explanation.some(line => line.includes('blocked'))).toBe(true);
  });

  it('overdue when there are overdue open items and none blocked', () => {
    const s = buildAuditPrepReadinessSummary(
      [{ status: 'IN_PROGRESS', targetDate: new Date('2026-03-20T00:00:00.000Z') }],
      now
    );
    expect(s.overallStatus).toBe('overdue');
    expect(s.overdueItems).toBe(1);
  });

  it('does not count complete items as overdue even with past targetDate', () => {
    const s = buildAuditPrepReadinessSummary(
      [{ status: 'COMPLETE', targetDate: new Date('2026-01-01T00:00:00.000Z') }],
      now
    );
    expect(s.overdueItems).toBe(0);
    expect(s.overallStatus).toBe('all_complete');
  });

  it('all_complete when every item is COMPLETE', () => {
    const s = buildAuditPrepReadinessSummary(
      [
        { status: 'COMPLETE', targetDate: null },
        { status: 'COMPLETE', targetDate: new Date('2026-12-31T00:00:00.000Z') },
      ],
      now
    );
    expect(s.openItems).toBe(0);
    expect(s.overallStatus).toBe('all_complete');
    expect(s.explanation.some(line => line.includes('Every item is marked complete'))).toBe(true);
  });

  it('in_progress when there are open items, none blocked, none overdue', () => {
    const s = buildAuditPrepReadinessSummary(
      [
        { status: 'NOT_STARTED', targetDate: null },
        { status: 'IN_PROGRESS', targetDate: new Date('2026-12-31T00:00:00.000Z') },
      ],
      now
    );
    expect(s.overallStatus).toBe('in_progress');
    expect(s.explanation.some(line => line.includes('in progress'))).toBe(true);
  });
});

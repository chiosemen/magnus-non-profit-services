import { describe, expect, it } from 'vitest';
import {
  computeVolunteerOperationsAnalytics,
  VOLUNTEER_ANALYTICS_META,
} from '../../apps/org-dashboard-api/src/volunteerOperationsAnalytics';

describe('volunteerOperationsAnalytics (deterministic)', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('NOT_CONFIGURED when no profiles and no entries', () => {
    const a = computeVolunteerOperationsAnalytics([], [], null, now);
    expect(a.volunteerDataStatus).toBe('NOT_CONFIGURED');
    expect(a.coverage.reasons.some(r => r.includes('NOT_CONFIGURED'))).toBe(true);
    expect(a.totals.totalHours).toBe(0);
    expect(a.hoursByPeriod.last30Days).toBe(0);
    expect(a.rosterSummary).toHaveLength(0);
    expect(a.recentActivity).toHaveLength(0);
  });

  it('INSUFFICIENT_DATA when profiles exist but no entries', () => {
    const profiles = [{ id: 'p1', displayName: 'A', isActive: true }];
    const a = computeVolunteerOperationsAnalytics(profiles, [], 25, now);
    expect(a.volunteerDataStatus).toBe('INSUFFICIENT_DATA');
    expect(a.coverage.reasons.some(r => r.includes('INSUFFICIENT_DATA'))).toBe(true);
  });

  it('INSUFFICIENT_DATA when fewer than min time entries', () => {
    const profiles = [{ id: 'p1', displayName: 'A', isActive: true }];
    const entries = [
      {
        id: 'e1',
        volunteerId: 'p1',
        programLabel: 'X',
        hours: 1,
        occurredAt: new Date('2026-05-01T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e2',
        volunteerId: 'p1',
        programLabel: 'X',
        hours: 2,
        occurredAt: new Date('2026-05-20T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
    ];
    const a = computeVolunteerOperationsAnalytics(profiles, entries, 30, now);
    expect(a.volunteerDataStatus).toBe('INSUFFICIENT_DATA');
    expect(a.coverage.reasons.some(r => r.includes(String(VOLUNTEER_ANALYTICS_META.minTimeEntriesForOk)))).toBe(true);
  });

  it('INSUFFICIENT_DATA when rate is null but entries exist', () => {
    const profiles = [{ id: 'p1', displayName: 'A', isActive: true }];
    const entries = [1, 2, 3].map((n, i) => ({
      id: `e${n}`,
      volunteerId: 'p1',
      programLabel: 'X',
      hours: 1,
      occurredAt: new Date(`2026-0${i + 1}-10T12:00:00.000Z`),
      timesheetStatus: 'LOGGED' as const,
    }));
    const a = computeVolunteerOperationsAnalytics(profiles, entries, null, now);
    expect(a.volunteerDataStatus).toBe('INSUFFICIENT_DATA');
    expect(a.assumptions.inKindAvailable).toBe(false);
    expect(a.assumptions.inKindEstimateUsd).toBeNull();
    expect(a.coverage.reasons.some(r => r.includes('In-kind rate is not set'))).toBe(true);
  });

  it('INSUFFICIENT_DATA when any entry is MISSING_REQUIRED_FIELDS', () => {
    const profiles = [{ id: 'p1', displayName: 'A', isActive: true }];
    const entries = [
      {
        id: 'e1',
        volunteerId: 'p1',
        programLabel: 'X',
        hours: 1,
        occurredAt: new Date('2026-01-10T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e2',
        volunteerId: 'p1',
        programLabel: 'X',
        hours: 1,
        occurredAt: new Date('2026-02-10T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e3',
        volunteerId: 'p1',
        programLabel: 'X',
        hours: 1,
        occurredAt: new Date('2026-03-10T12:00:00.000Z'),
        timesheetStatus: 'MISSING_REQUIRED_FIELDS' as const,
      },
    ];
    const a = computeVolunteerOperationsAnalytics(profiles, entries, 20, now);
    expect(a.volunteerDataStatus).toBe('INSUFFICIENT_DATA');
    expect(a.missingTimesheetFields).toHaveLength(1);
    expect(a.missingTimesheetFields[0]!.timeEntryId).toBe('e3');
  });

  it('hoursByPeriod sums rolling windows in UTC', () => {
    const profiles = [{ id: 'p1', displayName: 'A', isActive: true }];
    const entries = [
      {
        id: 'e1',
        volunteerId: 'p1',
        programLabel: 'P',
        hours: 10,
        occurredAt: new Date('2026-06-10T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e2',
        volunteerId: 'p1',
        programLabel: 'P',
        hours: 5,
        occurredAt: new Date('2026-04-01T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e3',
        volunteerId: 'p1',
        programLabel: 'P',
        hours: 7,
        occurredAt: new Date('2025-06-20T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
    ];
    const a = computeVolunteerOperationsAnalytics(profiles, entries, 15, now);
    expect(a.hoursByPeriod.last30Days).toBe(10);
    expect(a.hoursByPeriod.last90Days).toBe(15);
    expect(a.hoursByPeriod.last365Days).toBe(22);
    expect(a.totals.totalHours).toBe(22);
  });

  it('in-kind estimate rounds to cents at fixed rate', () => {
    const profiles = [{ id: 'p1', displayName: 'A', isActive: true }];
    const entries = [
      {
        id: 'e1',
        volunteerId: 'p1',
        programLabel: 'P',
        hours: 1,
        occurredAt: new Date('2026-01-15T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e2',
        volunteerId: 'p1',
        programLabel: 'P',
        hours: 1,
        occurredAt: new Date('2026-02-15T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e3',
        volunteerId: 'p1',
        programLabel: 'P',
        hours: 1,
        occurredAt: new Date('2026-03-15T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
    ];
    const a = computeVolunteerOperationsAnalytics(profiles, entries, 10, now);
    expect(a.assumptions.inKindEstimateUsd).toBe(30);
    expect(a.assumptions.valuationDisclaimer.length).toBeGreaterThan(20);
  });

  it('OK when thresholds met: 3+ entries, span ≥30d, rate set, all LOGGED', () => {
    const profiles = [
      { id: 'p1', displayName: 'A', isActive: true },
      { id: 'p2', displayName: 'B', isActive: false },
    ];
    const entries = [
      {
        id: 'e1',
        volunteerId: 'p1',
        programLabel: 'Food',
        hours: 2,
        occurredAt: new Date('2026-01-01T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e2',
        volunteerId: 'p2',
        programLabel: 'Food',
        hours: 3,
        occurredAt: new Date('2026-02-15T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
      {
        id: 'e3',
        volunteerId: 'p1',
        programLabel: 'Events',
        hours: 4,
        occurredAt: new Date('2026-06-01T12:00:00.000Z'),
        timesheetStatus: 'LOGGED' as const,
      },
    ];
    const a = computeVolunteerOperationsAnalytics(profiles, entries, 12.5, now);
    expect(a.volunteerDataStatus).toBe('OK');
    expect(a.coverage.level).toBe('strong');
    expect(a.hoursByProgram.map(x => x.programLabel).sort()).toEqual(['Events', 'Food']);
    expect(a.totals.volunteersWithHoursLast365).toBe(2);
    expect(a.rosterSummary).toHaveLength(2);
    expect(a.recentActivity[0]!.timeEntryId).toBe('e3');
  });
});

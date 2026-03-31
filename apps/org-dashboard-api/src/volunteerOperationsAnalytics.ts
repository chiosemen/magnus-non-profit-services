/** Pure deterministic volunteer operations analytics (no scoring, no CRM). */

export type VolunteerDataStatus = 'NOT_CONFIGURED' | 'INSUFFICIENT_DATA' | 'OK';

export type RawVolunteerProfile = {
  id: string;
  displayName: string;
  isActive: boolean;
};

export type RawVolunteerTimeEntry = {
  id: string;
  volunteerId: string;
  programLabel: string;
  hours: number;
  occurredAt: Date;
  timesheetStatus: 'LOGGED' | 'MISSING_REQUIRED_FIELDS';
};

export const VOLUNTEER_ANALYTICS_META = {
  minTimeEntriesForOk: 3,
  minEntryHistorySpanDays: 30,
  rosterCap: 200,
  recentActivityLimit: 50,
} as const;

export const VOLUNTEER_FORMULAS = {
  totalVolunteers: 'COUNT VolunteerProfile rows for the org.',
  activeRoster: 'Profiles where isActive is true (roster flag; not hours-based).',
  volunteersWithHours365: 'DISTINCT volunteerId with ≥1 time entry in rolling 365d.',
  hoursByPeriod: 'Sum of entry hours where occurredAt falls in rolling 30d / 90d / 365d windows (UTC).',
  hoursByProgram: 'Sum of hours grouped by time entry programLabel.',
  inKindEstimate:
    'sum(all entry hours) × organization.volunteerHourlyRateUsd when rate is set; illustrative only, not an audited or compliance valuation.',
} as const;

const MS_PER_DAY = 86_400_000;

function dayDiff(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export type VolunteerOperationsAnalytics = {
  volunteerDataStatus: VolunteerDataStatus;
  coverage: { level: 'strong' | 'weak'; reasons: string[] };
  formulas: typeof VOLUNTEER_FORMULAS;
  meta: typeof VOLUNTEER_ANALYTICS_META;
  assumptions: {
    inKindFormula: string;
    hourlyRateUsd: number | null;
    inKindEstimateUsd: number | null;
    inKindAvailable: boolean;
    valuationDisclaimer: string;
  };
  totals: {
    totalHours: number;
    activeVolunteerProfiles: number;
    totalVolunteerProfiles: number;
    timeEntryCount: number;
    volunteersWithHoursLast365: number;
  };
  hoursByPeriod: {
    last30Days: number;
    last90Days: number;
    last365Days: number;
  };
  hoursByProgram: Array<{ programLabel: string; hours: number }>;
  rosterSummary: Array<{
    volunteerId: string;
    displayName: string;
    isActive: boolean;
    totalHours: number;
    lastOccurredAt: string | null;
  }>;
  recentActivity: Array<{
    timeEntryId: string;
    volunteerId: string;
    displayName: string;
    programLabel: string;
    hours: number;
    occurredAt: string;
    timesheetStatus: 'LOGGED' | 'MISSING_REQUIRED_FIELDS';
  }>;
  missingTimesheetFields: Array<{
    timeEntryId: string;
    volunteerId: string;
    occurredAt: string;
    message: string;
  }>;
};

export function computeVolunteerOperationsAnalytics(
  profiles: RawVolunteerProfile[],
  entries: RawVolunteerTimeEntry[],
  volunteerHourlyRateUsd: number | null,
  now: Date
): VolunteerOperationsAnalytics {
  const valuationDisclaimer =
    'Illustrative in-kind value only. Not an audited figure, GAAP valuation, or compliance-grade in-kind reporting; use only as internal planning support when your data and rate assumption are complete.';

  const inKindFormula =
    'sum(all time entry hours for the org) × organization.volunteerHourlyRateUsd when rate is configured';

  const profileById = new Map(profiles.map(p => [p.id, p]));
  const activeVolunteerProfiles = profiles.filter(p => p.isActive).length;

  if (profiles.length === 0 && entries.length === 0) {
    return {
      volunteerDataStatus: 'NOT_CONFIGURED',
      coverage: {
        level: 'weak',
        reasons: [
          'NOT_CONFIGURED: No volunteer profiles or time entries exist. Add roster and log hours before volunteer operations reporting applies.',
        ],
      },
      formulas: VOLUNTEER_FORMULAS,
      meta: VOLUNTEER_ANALYTICS_META,
      assumptions: {
        inKindFormula,
        hourlyRateUsd: volunteerHourlyRateUsd,
        inKindEstimateUsd: null,
        inKindAvailable: false,
        valuationDisclaimer,
      },
      totals: {
        totalHours: 0,
        activeVolunteerProfiles: 0,
        totalVolunteerProfiles: 0,
        timeEntryCount: 0,
        volunteersWithHoursLast365: 0,
      },
      hoursByPeriod: { last30Days: 0, last90Days: 0, last365Days: 0 },
      hoursByProgram: [],
      rosterSummary: [],
      recentActivity: [],
      missingTimesheetFields: [],
    };
  }

  const reasons: string[] = [];
  let level: 'strong' | 'weak' = 'strong';

  if (profiles.length > 0 && entries.length === 0) {
    level = 'weak';
    reasons.push(
      'INSUFFICIENT_DATA: Volunteer profiles exist but no time entries are recorded; hours and in-kind estimates are empty.'
    );
  }

  if (entries.length > 0 && entries.length < VOLUNTEER_ANALYTICS_META.minTimeEntriesForOk) {
    level = 'weak';
    reasons.push(
      `INSUFFICIENT_DATA: Fewer than ${VOLUNTEER_ANALYTICS_META.minTimeEntriesForOk} time entries; aggregates are preliminary.`
    );
  }

  const missingEntries = entries.filter(e => e.timesheetStatus === 'MISSING_REQUIRED_FIELDS');
  if (missingEntries.length > 0) {
    level = 'weak';
    reasons.push(
      'INSUFFICIENT_DATA: One or more time entries are flagged MISSING_REQUIRED_FIELDS; resolve before treating logs as complete.'
    );
  }

  if (entries.length > 0 && volunteerHourlyRateUsd == null) {
    level = 'weak';
    reasons.push(
      'INSUFFICIENT_DATA: In-kind rate is not set on the organization while hours exist; valuation is unavailable until volunteerHourlyRateUsd is configured.'
    );
  }

  if (entries.length >= 2) {
    const sortedDates = entries.map(e => e.occurredAt.getTime()).sort((a, b) => a - b);
    const span = dayDiff(new Date(sortedDates[sortedDates.length - 1]!), new Date(sortedDates[0]!));
    if (span < VOLUNTEER_ANALYTICS_META.minEntryHistorySpanDays) {
      level = 'weak';
      reasons.push(
        `INSUFFICIENT_DATA: Time entry history spans less than ${VOLUNTEER_ANALYTICS_META.minEntryHistorySpanDays} days; period trends may be thin.`
      );
    }
  } else if (entries.length === 1) {
    level = 'weak';
    reasons.push(
      `INSUFFICIENT_DATA: Only one time entry; history span is too short for stable period comparisons.`
    );
  }

  const cutoff30 = new Date(now.getTime() - 30 * MS_PER_DAY);
  const cutoff90 = new Date(now.getTime() - 90 * MS_PER_DAY);
  const cutoff365 = new Date(now.getTime() - 365 * MS_PER_DAY);

  let last30 = 0;
  let last90 = 0;
  let last365 = 0;
  const hoursByProgram = new Map<string, number>();
  let totalHours = 0;
  const volunteersIn365 = new Set<string>();

  for (const e of entries) {
    const h = e.hours;
    totalHours += h;
    hoursByProgram.set(e.programLabel, (hoursByProgram.get(e.programLabel) ?? 0) + h);
    const t = e.occurredAt.getTime();
    if (t >= cutoff30.getTime() && t <= now.getTime()) last30 += h;
    if (t >= cutoff90.getTime() && t <= now.getTime()) last90 += h;
    if (t >= cutoff365.getTime() && t <= now.getTime()) {
      last365 += h;
      volunteersIn365.add(e.volunteerId);
    }
  }

  const rate = volunteerHourlyRateUsd != null && Number.isFinite(volunteerHourlyRateUsd) ? volunteerHourlyRateUsd : null;
  const inKindEstimateUsd =
    rate != null ? Math.round(totalHours * rate * 100) / 100 : null;

  const hoursByProgramList = Array.from(hoursByProgram.entries())
    .map(([programLabel, hours]) => ({ programLabel, hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);

  const hoursByVolunteer = new Map<string, { total: number; last: Date }>();
  for (const e of entries) {
    const cur = hoursByVolunteer.get(e.volunteerId) ?? { total: 0, last: e.occurredAt };
    cur.total += e.hours;
    if (e.occurredAt > cur.last) cur.last = e.occurredAt;
    hoursByVolunteer.set(e.volunteerId, cur);
  }

  const rosterSummary = profiles
    .map(p => {
      const agg = hoursByVolunteer.get(p.id);
      return {
        volunteerId: p.id,
        displayName: p.displayName,
        isActive: p.isActive,
        totalHours: agg ? Math.round(agg.total * 100) / 100 : 0,
        lastOccurredAt: agg ? agg.last.toISOString() : null,
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, VOLUNTEER_ANALYTICS_META.rosterCap);

  const recentActivity = [...entries]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, VOLUNTEER_ANALYTICS_META.recentActivityLimit)
    .map(e => ({
      timeEntryId: e.id,
      volunteerId: e.volunteerId,
      displayName: profileById.get(e.volunteerId)?.displayName ?? e.volunteerId,
      programLabel: e.programLabel,
      hours: Math.round(e.hours * 100) / 100,
      occurredAt: e.occurredAt.toISOString(),
      timesheetStatus: e.timesheetStatus,
    }));

  const missingTimesheetFields = missingEntries.slice(0, 100).map(e => ({
    timeEntryId: e.id,
    volunteerId: e.volunteerId,
    occurredAt: e.occurredAt.toISOString(),
    message: 'Time entry flagged MISSING_REQUIRED_FIELDS (operational follow-up).',
  }));

  const volunteerDataStatus: VolunteerDataStatus = level === 'strong' ? 'OK' : 'INSUFFICIENT_DATA';

  return {
    volunteerDataStatus,
    coverage: { level, reasons },
    formulas: VOLUNTEER_FORMULAS,
    meta: VOLUNTEER_ANALYTICS_META,
    assumptions: {
      inKindFormula,
      hourlyRateUsd: rate,
      inKindEstimateUsd,
      inKindAvailable: rate != null,
      valuationDisclaimer,
    },
    totals: {
      totalHours: Math.round(totalHours * 100) / 100,
      activeVolunteerProfiles,
      totalVolunteerProfiles: profiles.length,
      timeEntryCount: entries.length,
      volunteersWithHoursLast365: volunteersIn365.size,
    },
    hoursByPeriod: {
      last30Days: Math.round(last30 * 100) / 100,
      last90Days: Math.round(last90 * 100) / 100,
      last365Days: Math.round(last365 * 100) / 100,
    },
    hoursByProgram: hoursByProgramList,
    rosterSummary,
    recentActivity,
    missingTimesheetFields,
  };
}

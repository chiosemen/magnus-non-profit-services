import prisma from '@magnus/db/client';
import { z } from 'zod';

/** In-kind estimate: hours × org.volunteerHourlyRateUsd when rate is set; otherwise unavailable. */

export const CreateVolunteerProfileSchema = z
  .object({
    displayName: z.string().min(1).max(200),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const CreateVolunteerTimeEntrySchema = z
  .object({
    volunteerId: z.string().uuid(),
    programLabel: z.string().min(1).max(256),
    hours: z.number().finite().positive().max(1_000),
    occurredAt: z.string().datetime(),
    timesheetStatus: z.enum(['LOGGED', 'MISSING_REQUIRED_FIELDS']).optional().default('LOGGED'),
    volunteerAssignmentId: z.string().uuid().optional(),
  })
  .strict();

export const CreateVolunteerAssignmentSchema = z
  .object({
    title: z.string().min(1).max(200),
    programLabel: z.string().min(1).max(256),
    startAt: z.string().datetime(),
    volunteerId: z.string().uuid().optional(),
  })
  .strict();

export const PutVolunteerOpsSettingsSchema = z
  .object({
    volunteerHourlyRateUsd: z.number().finite().min(0).max(10_000).nullable(),
  })
  .strict();

export async function putVolunteerOperationsSettings(
  orgId: string,
  input: z.infer<typeof PutVolunteerOpsSettingsSchema>
) {
  const parsed = PutVolunteerOpsSettingsSchema.parse(input);
  await prisma.organization.update({
    where: { id: orgId },
    data: { volunteerHourlyRateUsd: parsed.volunteerHourlyRateUsd },
  });
  return { ok: true as const };
}

export async function createVolunteerProfile(params: { orgId: string; input: z.infer<typeof CreateVolunteerProfileSchema> }) {
  const input = CreateVolunteerProfileSchema.parse(params.input);
  const row = await prisma.volunteerProfile.create({
    data: {
      orgId: params.orgId,
      displayName: input.displayName,
      isActive: input.isActive,
    },
  });
  return {
    id: row.id,
    displayName: row.displayName,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createVolunteerTimeEntry(params: { orgId: string; input: z.infer<typeof CreateVolunteerTimeEntrySchema> }) {
  const input = CreateVolunteerTimeEntrySchema.parse(params.input);
  const row = await prisma.volunteerTimeEntry.create({
    data: {
      orgId: params.orgId,
      volunteerId: input.volunteerId,
      programLabel: input.programLabel,
      hours: input.hours,
      occurredAt: new Date(input.occurredAt),
      timesheetStatus: input.timesheetStatus,
      volunteerAssignmentId: input.volunteerAssignmentId ?? null,
    },
  });
  return {
    id: row.id,
    volunteerId: row.volunteerId,
    programLabel: row.programLabel,
    hours: Number(row.hours),
    occurredAt: row.occurredAt.toISOString(),
    timesheetStatus: row.timesheetStatus,
  };
}

export async function createVolunteerAssignment(params: { orgId: string; input: z.infer<typeof CreateVolunteerAssignmentSchema> }) {
  const input = CreateVolunteerAssignmentSchema.parse(params.input);
  const row = await prisma.volunteerAssignment.create({
    data: {
      orgId: params.orgId,
      title: input.title,
      programLabel: input.programLabel,
      startAt: new Date(input.startAt),
      volunteerId: input.volunteerId ?? null,
    },
  });
  return {
    id: row.id,
    title: row.title,
    programLabel: row.programLabel,
    startAt: row.startAt.toISOString(),
    volunteerId: row.volunteerId,
  };
}

export async function getVolunteerOperationsSummary(orgId: string, now: Date = new Date()) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { volunteerHourlyRateUsd: true },
  });

  const [profiles, entries, assignments] = await Promise.all([
    prisma.volunteerProfile.findMany({ where: { orgId } }),
    prisma.volunteerTimeEntry.findMany({ where: { orgId } }),
    prisma.volunteerAssignment.findMany({
      where: { orgId, startAt: { gte: new Date(now.getTime() - 86_400_000) } },
      orderBy: [{ startAt: 'asc' }],
      take: 50,
    }),
  ]);

  const activeVolunteers = new Set(
    profiles.filter(p => p.isActive).map(p => p.id)
  );
  const hoursByProgram = new Map<string, number>();
  let totalHours = 0;
  for (const e of entries) {
    const h = Number(e.hours);
    totalHours += h;
    hoursByProgram.set(e.programLabel, (hoursByProgram.get(e.programLabel) ?? 0) + h);
  }

  const rate = org?.volunteerHourlyRateUsd != null ? Number(org.volunteerHourlyRateUsd) : null;
  const inKindEstimateUsd =
    rate != null && Number.isFinite(rate) ? Math.round(totalHours * rate * 100) / 100 : null;

  const missingTimesheetAlerts = entries
    .filter(e => e.timesheetStatus === 'MISSING_REQUIRED_FIELDS')
    .slice(0, 100)
    .map(e => ({
      timeEntryId: e.id,
      volunteerId: e.volunteerId,
      occurredAt: e.occurredAt.toISOString(),
      message: 'Time entry flagged MISSING_REQUIRED_FIELDS (operational follow-up).',
    }));

  const assignmentIdsWithTime = new Set(
    entries.map(e => e.volunteerAssignmentId).filter((x): x is string => x != null)
  );
  const staleAssignments = assignments
    .filter(a => a.startAt < now && !assignmentIdsWithTime.has(a.id))
    .map(a => ({
      assignmentId: a.id,
      title: a.title,
      startAt: a.startAt.toISOString(),
      message: 'Assignment start time passed with no linked time entry.',
    }));

  return {
    orgId,
    assumptions: {
      inKindFormula: 'sum(hours) × organization.volunteerHourlyRateUsd when rate is configured',
      hourlyRateUsd: rate,
      inKindEstimateUsd,
      inKindAvailable: rate != null,
    },
    totals: {
      totalHours: Math.round(totalHours * 100) / 100,
      activeVolunteerProfiles: activeVolunteers.size,
      totalVolunteerProfiles: profiles.length,
      timeEntryCount: entries.length,
    },
    hoursByProgram: Array.from(hoursByProgram.entries())
      .map(([programLabel, hours]) => ({ programLabel, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours),
    upcomingAssignments: assignments
      .filter(a => a.startAt >= now)
      .map(a => ({
        id: a.id,
        title: a.title,
        programLabel: a.programLabel,
        startAt: a.startAt.toISOString(),
        volunteerId: a.volunteerId,
      })),
    alerts: {
      missingTimesheetFields: missingTimesheetAlerts,
      assignmentsWithoutTimeEntry: staleAssignments,
    },
  };
}

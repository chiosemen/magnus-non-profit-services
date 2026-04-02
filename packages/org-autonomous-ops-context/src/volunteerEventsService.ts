import type { Prisma, PrismaClient } from '@magnus/db/types';
import { Prisma as PrismaRuntime } from '@magnus/db/types';

export const VOLUNTEER_EVENT_DUPLICATE = 'VOLUNTEER_EVENT_DUPLICATE';

export type VolunteerEventDto = {
  id: string;
  orgId: string;
  occurredAt: string;
  hours: string;
  activityLabel: string | null;
  sourceSystem: string;
  sourceRef: string;
  raw: Prisma.JsonValue | null;
  createdAt: string;
};

export type ListVolunteerEventsOptions = {
  start?: Date;
  end?: Date;
  take?: number;
};

export type AppendVolunteerEventInput = {
  occurredAt: Date;
  hours: number;
  activityLabel?: string | null;
  sourceSystem: string;
  sourceRef: string;
  raw?: Prisma.InputJsonValue;
};

function toDto(row: {
  id: string;
  orgId: string;
  occurredAt: Date;
  hours: Prisma.Decimal;
  activityLabel: string | null;
  sourceSystem: string;
  sourceRef: string;
  raw: Prisma.JsonValue | null;
  createdAt: Date;
}): VolunteerEventDto {
  return {
    id: row.id,
    orgId: row.orgId,
    occurredAt: row.occurredAt.toISOString(),
    hours: row.hours.toString(),
    activityLabel: row.activityLabel,
    sourceSystem: row.sourceSystem,
    sourceRef: row.sourceRef,
    raw: row.raw === null ? null : row.raw,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listVolunteerEvents(
  db: PrismaClient,
  orgId: string,
  options: ListVolunteerEventsOptions = {},
): Promise<VolunteerEventDto[]> {
  const take = Math.min(500, Math.max(1, options.take ?? 100));
  const where: Prisma.VolunteerEventWhereInput = { orgId };
  if (options.start || options.end) {
    where.occurredAt = {};
    if (options.start) where.occurredAt.gte = options.start;
    if (options.end) where.occurredAt.lte = options.end;
  }
  const rows = await db.volunteerEvent.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take,
  });
  return rows.map(toDto);
}

export async function appendVolunteerEvent(
  db: PrismaClient,
  orgId: string,
  input: AppendVolunteerEventInput,
): Promise<VolunteerEventDto> {
  const activityLabel =
    input.activityLabel === undefined || input.activityLabel === null
      ? null
      : input.activityLabel.trim().slice(0, 256) || null;
  try {
    const row = await db.volunteerEvent.create({
      data: {
        orgId,
        occurredAt: input.occurredAt,
        hours: input.hours,
        activityLabel,
        sourceSystem: input.sourceSystem.trim().slice(0, 64),
        sourceRef: input.sourceRef.trim().slice(0, 512),
        raw: input.raw === undefined ? undefined : input.raw,
      },
    });
    return toDto(row);
  } catch (err: unknown) {
    if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
      const dup = new Error(VOLUNTEER_EVENT_DUPLICATE);
      (dup as Error & { cause?: unknown }).cause = err;
      throw dup;
    }
    throw err;
  }
}

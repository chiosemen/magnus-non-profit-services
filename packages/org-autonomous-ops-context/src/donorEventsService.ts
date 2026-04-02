import type { Prisma, PrismaClient } from '@magnus/db/types';
import { Prisma as PrismaRuntime } from '@magnus/db/types';

export const DONOR_EVENT_DUPLICATE = 'DONOR_EVENT_DUPLICATE';

export type DonorEventDto = {
  id: string;
  orgId: string;
  occurredAt: string;
  amount: string;
  currency: string;
  sourceSystem: string;
  sourceRef: string;
  raw: Prisma.JsonValue | null;
  createdAt: string;
};

export type ListDonorEventsOptions = {
  start?: Date;
  end?: Date;
  take?: number;
};

export type AppendDonorEventInput = {
  occurredAt: Date;
  amount: number;
  currency?: string;
  sourceSystem: string;
  sourceRef: string;
  raw?: Prisma.InputJsonValue;
};

function toDto(row: {
  id: string;
  orgId: string;
  occurredAt: Date;
  amount: Prisma.Decimal;
  currency: string;
  sourceSystem: string;
  sourceRef: string;
  raw: Prisma.JsonValue | null;
  createdAt: Date;
}): DonorEventDto {
  return {
    id: row.id,
    orgId: row.orgId,
    occurredAt: row.occurredAt.toISOString(),
    amount: row.amount.toString(),
    currency: row.currency,
    sourceSystem: row.sourceSystem,
    sourceRef: row.sourceRef,
    raw: row.raw === null ? null : row.raw,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listDonorEvents(
  db: PrismaClient,
  orgId: string,
  options: ListDonorEventsOptions = {},
): Promise<DonorEventDto[]> {
  const take = Math.min(500, Math.max(1, options.take ?? 100));
  const where: Prisma.DonorEventWhereInput = { orgId };
  if (options.start || options.end) {
    where.occurredAt = {};
    if (options.start) where.occurredAt.gte = options.start;
    if (options.end) where.occurredAt.lte = options.end;
  }
  const rows = await db.donorEvent.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take,
  });
  return rows.map(toDto);
}

export async function appendDonorEvent(
  db: PrismaClient,
  orgId: string,
  input: AppendDonorEventInput,
): Promise<DonorEventDto> {
  const currency = (input.currency ?? 'USD').trim().slice(0, 8) || 'USD';
  try {
    const row = await db.donorEvent.create({
      data: {
        orgId,
        occurredAt: input.occurredAt,
        amount: input.amount,
        currency,
        sourceSystem: input.sourceSystem.trim().slice(0, 64),
        sourceRef: input.sourceRef.trim().slice(0, 512),
        raw: input.raw === undefined ? undefined : input.raw,
      },
    });
    return toDto(row);
  } catch (err: unknown) {
    if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
      const dup = new Error(DONOR_EVENT_DUPLICATE);
      (dup as Error & { cause?: unknown }).cause = err;
      throw dup;
    }
    throw err;
  }
}

import { PrismaClient, Prisma } from '@magnus/db/types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface GrantDto {
  id: string;
  orgId: string;
  funderName: string;
  totalAmount: Prisma.Decimal;
  startDate: Date;
  endDate: Date;
  spentToDate: Prisma.Decimal;
  reportingSchedule: Prisma.JsonValue;
  createdAt: Date;
}

export async function createGrant(
  db: PrismaClient,
  orgId: string,
  data: {
    funderName: string;
    totalAmount: number | string | Prisma.Decimal;
    startDate: Date | string;
    endDate: Date | string;
    spentToDate?: number | string | Prisma.Decimal;
    reportingSchedule: Prisma.JsonValue;
  }
): Promise<GrantDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!data.funderName?.trim()) throw new ValidationError('Funder name is required.');

  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);

  if (Number.isNaN(startDate.getTime())) throw new ValidationError('Invalid start date.');
  if (Number.isNaN(endDate.getTime())) throw new ValidationError('Invalid end date.');
  if (startDate > endDate) throw new ValidationError('Start date cannot be after end date.');

  const totalAmt = new Prisma.Decimal(data.totalAmount ?? 0);
  if (totalAmt.isNegative()) throw new ValidationError('Total amount cannot be negative.');

  const spentAmt = new Prisma.Decimal(data.spentToDate ?? 0);
  if (spentAmt.isNegative()) throw new ValidationError('Spent amount cannot be negative.');

  const grant = await db.grant.create({
    data: {
      orgId,
      funderName: data.funderName.trim(),
      totalAmount: totalAmt,
      startDate,
      endDate,
      spentToDate: spentAmt,
      reportingSchedule: data.reportingSchedule as any,
    },
  });

  return grant;
}

export async function listGrants(db: PrismaClient, orgId: string): Promise<GrantDto[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  return await db.grant.findMany({
    where: { orgId },
    orderBy: { endDate: 'desc' },
  });
}

export async function getGrant(
  db: PrismaClient,
  orgId: string,
  grantId: string
): Promise<GrantDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  const grant = await db.grant.findFirst({
    where: { id: grantId, orgId },
  });
  if (!grant) throw new NotFoundError('Grant not found.');
  return grant;
}

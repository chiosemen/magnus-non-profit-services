import { PrismaClient, ComplianceDeadlineType, ComplianceStatus } from '@magnus/db/types';

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

export interface ComplianceDeadlineDto {
  id: string;
  orgId: string;
  deadlineType: ComplianceDeadlineType;
  dueDate: Date;
  status: ComplianceStatus;
  asanaTaskId: string | null;
  createdAt: Date;
}

export async function createComplianceDeadline(
  db: PrismaClient,
  orgId: string,
  data: {
    deadlineType: ComplianceDeadlineType;
    dueDate: Date | string;
    status?: ComplianceStatus;
    asanaTaskId?: string;
  }
): Promise<ComplianceDeadlineDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!data.deadlineType) throw new ValidationError('Deadline type is required.');

  const dueDate = new Date(data.dueDate);
  if (Number.isNaN(dueDate.getTime())) throw new ValidationError('Invalid due date.');

  const status = data.status || ComplianceStatus.PENDING;

  const deadline = await db.complianceCalendar.create({
    data: {
      orgId,
      deadlineType: data.deadlineType,
      dueDate,
      status,
      asanaTaskId: data.asanaTaskId?.trim() || null,
    },
  });

  return deadline;
}

export async function updateComplianceStatus(
  db: PrismaClient,
  orgId: string,
  complianceId: string,
  status: ComplianceStatus
): Promise<ComplianceDeadlineDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!status) throw new ValidationError('Status is required.');

  const existing = await db.complianceCalendar.findFirst({
    where: { id: complianceId, orgId },
  });
  if (!existing) throw new NotFoundError('Compliance deadline not found.');

  const updated = await db.complianceCalendar.update({
    where: { id: complianceId },
    data: { status },
  });

  return updated;
}

export async function listComplianceCalendar(
  db: PrismaClient,
  orgId: string
): Promise<ComplianceDeadlineDto[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  return await db.complianceCalendar.findMany({
    where: { orgId },
    orderBy: { dueDate: 'asc' },
  });
}

import { z } from 'zod';
import { prisma } from '@magnus/db/client';

export const listVolunteerHoursSchema = z.object({
  volunteerId: z.string().uuid().optional().describe('Filter by volunteer UUID'),
  limit: z.number().int().min(1).max(100).default(50).describe('Limit results count'),
});

export type ListVolunteerHoursInput = z.infer<typeof listVolunteerHoursSchema>;

export async function execute(
  input: ListVolunteerHoursInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { volunteerId, limit } = listVolunteerHoursSchema.parse(input);
  const orgId = context.orgId;

  const where: any = { orgId };
  if (volunteerId) where.volunteerId = volunteerId;

  const logs = await prisma.volunteerEvent.findMany({
    where,
    orderBy: { occurredAt: 'desc' },
    take: limit,
    include: {
      volunteer: { select: { name: true } },
      event: { select: { name: true } },
    },
  });

  return JSON.stringify(
    logs.map((l: any) => ({
      id: l.id,
      volunteerName: l.volunteer?.name ?? 'Anonymous Ledger Entry',
      eventName: l.event?.name ?? null,
      hours: Number(l.hours),
      date: l.occurredAt.toISOString().split('T')[0],
      activityLabel: l.activityLabel,
      sourceSystem: l.sourceSystem,
    })),
    null,
    2
  );
}

export default { name: 'list-volunteer-hours', schema: listVolunteerHoursSchema, execute };

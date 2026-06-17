import { z } from 'zod';
import { prisma } from '@magnus/db/client';

export const listDonationsSchema = z.object({
  donorId: z.string().uuid().optional().describe('Filter by donor UUID'),
  campaignId: z.string().uuid().optional().describe('Filter by campaign UUID'),
  limit: z.number().int().min(1).max(100).default(50).describe('Limit results count'),
});

export type ListDonationsInput = z.infer<typeof listDonationsSchema>;

export async function execute(
  input: ListDonationsInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { donorId, campaignId, limit } = listDonationsSchema.parse(input);
  const orgId = context.orgId;

  const where: any = { orgId };
  if (donorId) where.donorId = donorId;
  if (campaignId) where.campaignId = campaignId;

  const donations = await prisma.donation.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    take: limit,
    include: {
      donor: { select: { name: true } },
      campaign: { select: { title: true } },
    },
  });

  return JSON.stringify(
    donations.map((d: any) => ({
      id: d.id,
      donorName: d.donor.name,
      campaignName: d.campaign?.title ?? null,
      amount: Number(d.amount),
      receivedAt: d.receivedAt,
      paymentMethod: d.paymentMethod,
    })),
    null,
    2
  );
}

export default { name: 'list-donations', schema: listDonationsSchema, execute };

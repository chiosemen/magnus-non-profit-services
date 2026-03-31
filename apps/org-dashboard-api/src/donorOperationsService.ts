import prisma from '@magnus/db/client';
import { z } from 'zod';
import { computeDonorOperationsSnapshot, type RawGift } from './donorOperationsAnalytics';

export const CreateDonationCampaignSchema = z
  .object({
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(80).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .strict();

export const CreateDonationGiftSchema = z
  .object({
    donorKey: z.string().min(1).max(128),
    amount: z.number().finite().positive().max(100_000_000),
    giftDate: z.string().datetime(),
    isRecurring: z.boolean().optional().default(false),
    campaignId: z.string().uuid().optional(),
    sourceSystem: z.string().max(64).optional(),
  })
  .strict();

export const CreateDonationGiftsBatchSchema = z
  .object({
    gifts: z.array(CreateDonationGiftSchema).min(1).max(500),
  })
  .strict();

export async function createDonationCampaign(params: { orgId: string; input: z.infer<typeof CreateDonationCampaignSchema> }) {
  const input = CreateDonationCampaignSchema.parse(params.input);
  const row = await prisma.donationCampaign.create({
    data: {
      orgId: params.orgId,
      name: input.name,
      slug: input.slug ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
  });
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    slug: row.slug,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDonationCampaigns(orgId: string) {
  const rows = await prisma.donationCampaign.findMany({
    where: { orgId },
    orderBy: [{ createdAt: 'desc' }],
  });
  return rows.map(row => ({
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    slug: row.slug,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function createDonationGiftsBatch(params: { orgId: string; input: z.infer<typeof CreateDonationGiftsBatchSchema> }) {
  const input = CreateDonationGiftsBatchSchema.parse(params.input);
  const created = await prisma.$transaction(
    input.gifts.map(g =>
      prisma.donationGift.create({
        data: {
          orgId: params.orgId,
          donorKey: g.donorKey,
          amount: g.amount,
          giftDate: new Date(g.giftDate),
          isRecurring: g.isRecurring,
          campaignId: g.campaignId ?? null,
          sourceSystem: g.sourceSystem ?? null,
        },
      })
    )
  );
  return created.map(row => ({
    id: row.id,
    donorKey: row.donorKey,
    amount: Number(row.amount),
    giftDate: row.giftDate.toISOString(),
    isRecurring: row.isRecurring,
    campaignId: row.campaignId,
    sourceSystem: row.sourceSystem,
  }));
}

export async function getDonorOperationsSummary(orgId: string, now: Date = new Date()) {
  const [gifts, campaigns] = await Promise.all([
    prisma.donationGift.findMany({
      where: { orgId },
      orderBy: [{ giftDate: 'asc' }],
    }),
    prisma.donationCampaign.findMany({
      where: { orgId },
      select: { id: true, name: true },
    }),
  ]);

  const raw: RawGift[] = gifts.map(g => ({
    donorKey: g.donorKey,
    amount: Number(g.amount),
    giftDate: g.giftDate,
    isRecurring: g.isRecurring,
    campaignId: g.campaignId,
  }));

  const snapshot = computeDonorOperationsSnapshot(raw, campaigns, now);
  return {
    orgId,
    giftCount: gifts.length,
    ...snapshot,
  };
}

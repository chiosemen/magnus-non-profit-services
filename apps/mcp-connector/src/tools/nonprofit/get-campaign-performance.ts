import { z } from 'zod';
import { prisma } from '@magnus/db/client';

export const getCampaignPerformanceSchema = z.object({
  campaignId: z.string().uuid().describe('UUID of the campaign'),
});

export type GetCampaignPerformanceInput = z.infer<typeof getCampaignPerformanceSchema>;

export async function execute(
  input: GetCampaignPerformanceInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { campaignId } = getCampaignPerformanceSchema.parse(input);
  const orgId = context.orgId;

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, orgId },
    include: {
      donations: true,
    },
  });

  if (!campaign) {
    return JSON.stringify({ error: 'CAMPAIGN_NOT_FOUND', message: `Campaign ${campaignId} not found.` });
  }

  const donationsCount = campaign.donations.length;
  const totalRaised = campaign.donations.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
  const goal = campaign.goalAmount ? Number(campaign.goalAmount) : null;
  const percentOfGoal = goal && goal > 0 ? Math.round((totalRaised / goal) * 100) : null;

  return JSON.stringify({
    campaignId: campaign.id,
    name: campaign.title,
    slug: campaign.slug,
    status: campaign.status,
    goal,
    totalRaised,
    percentOfGoal,
    donationsCount,
  }, null, 2);
}

export default { name: 'get-campaign-performance', schema: getCampaignPerformanceSchema, execute };

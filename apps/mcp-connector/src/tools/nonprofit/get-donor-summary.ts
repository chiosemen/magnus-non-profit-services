import { z } from 'zod';
import { prisma } from '@magnus/db/client';

export const getDonorSummarySchema = z.object({
  donorId: z.string().uuid().describe('UUID of the donor'),
});

export type GetDonorSummaryInput = z.infer<typeof getDonorSummarySchema>;

export async function execute(
  input: GetDonorSummaryInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { donorId } = getDonorSummarySchema.parse(input);
  const orgId = context.orgId;

  const donor = await prisma.donor.findFirst({
    where: { id: donorId, orgId },
    include: {
      donations: true,
      donorNotes: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!donor) {
    return JSON.stringify({ error: 'DONOR_NOT_FOUND', message: `Donor ${donorId} not found under this org.` });
  }

  const donationsCount = donor.donations.length;
  const totalDonationsAmount = donor.donations.reduce((sum: number, d: any) => sum + Number(d.amount), 0);

  return JSON.stringify({
    donorId: donor.id,
    name: donor.name,
    email: donor.email,
    phone: donor.phone,
    donationsCount,
    totalDonationsAmount,
    recentNotes: donor.donorNotes.map((n: any) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
    })),
  }, null, 2);
}

export default { name: 'get-donor-summary', schema: getDonorSummarySchema, execute };

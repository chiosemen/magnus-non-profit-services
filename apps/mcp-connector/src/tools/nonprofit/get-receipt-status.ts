import { z } from 'zod';
import { prisma } from '@magnus/db/client';

export const getReceiptStatusSchema = z.object({
  donationId: z.string().uuid().describe('UUID of the donation'),
});

export type GetReceiptStatusInput = z.infer<typeof getReceiptStatusSchema>;

export async function execute(
  input: GetReceiptStatusInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { donationId } = getReceiptStatusSchema.parse(input);
  const orgId = context.orgId;

  const receipt = await prisma.donationReceipt.findFirst({
    where: { donationId, orgId },
    include: {
      donation: {
        select: {
          amount: true,
          receivedAt: true,
          donor: { select: { name: true } },
        },
      },
    },
  });

  if (!receipt) {
    return JSON.stringify({ status: 'NOT_ISSUED', message: 'No receipt found for this donation.' });
  }

  return JSON.stringify({
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    status: receipt.status,
    issuedAt: receipt.issuedAt,
    voidedAt: receipt.voidedAt,
    voidReason: receipt.voidReason,
    donorName: receipt.donation.donor.name,
    amount: Number(receipt.donation.amount),
    receivedAt: receipt.donation.receivedAt,
  }, null, 2);
}

export default { name: 'get-receipt-status', schema: getReceiptStatusSchema, execute };

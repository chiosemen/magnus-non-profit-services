import { z } from 'zod';
import { prisma } from '@magnus/db/client';
import { buildBoardPacket, createProposal } from '@magnus/org-autonomous-ops-context';
import { ConciergeProposalType } from '@prisma/client';

export const draftBoardPacketSchema = z.object({
  includeAiNarrative: z.boolean().default(false).describe('Include draft AI narrative insights'),
});

export type DraftBoardPacketInput = z.infer<typeof draftBoardPacketSchema>;

export async function execute(
  input: DraftBoardPacketInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { includeAiNarrative } = draftBoardPacketSchema.parse(input);
  const orgId = context.orgId;

  // 1. Deterministically compile the board packet data
  const packet = await buildBoardPacket(prisma as any, orgId, { includeAiNarrative });

  // 2. Write it as a Concierge Proposal of type BOARD_BRIEF
  const proposal = await createProposal(prisma as any, orgId, {
    type: ConciergeProposalType.BOARD_BRIEF,
    confidence: 1.0,
    payload: {
      text: packet.executiveSummary.description,
      brief: packet.aiNarrative.content ?? packet.executiveSummary.description,
      data: packet,
    },
  });

  return JSON.stringify({
    success: true,
    message: 'Board Packet draft compiled and submitted as a concierge proposal for human review.',
    proposalId: proposal.id,
    status: proposal.status,
    confidence: proposal.confidence,
    generatedAt: packet.asOfIso,
  }, null, 2);
}

export default { name: 'draft-board-packet', schema: draftBoardPacketSchema, execute };

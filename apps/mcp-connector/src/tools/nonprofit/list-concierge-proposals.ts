import { z } from 'zod';
import { prisma } from '@magnus/db/client';

export const listConciergeProposalsSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED']).optional().describe('Filter by proposal status'),
  type: z.enum(['LEGACY_IMPORT_MAP', 'DONOR_SEGMENT', 'CAMPAIGN_DRAFT', 'BOARD_BRIEF', 'COMPLIANCE_REMINDER', 'ACCOUNT_MAPPING']).optional().describe('Filter by proposal type'),
  limit: z.number().int().min(1).max(100).default(50).describe('Limit results count'),
});

export type ListConciergeProposalsInput = z.infer<typeof listConciergeProposalsSchema>;

export async function execute(
  input: ListConciergeProposalsInput,
  context: { userId: string; orgId: string }
): Promise<string> {
  const { status, type, limit } = listConciergeProposalsSchema.parse(input);
  const orgId = context.orgId;

  const where: any = { orgId };
  if (status) where.status = status;
  if (type) where.type = type;

  const proposals = await prisma.conciergeProposal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return JSON.stringify(
    proposals.map((p: any) => ({
      id: p.id,
      type: p.type,
      status: p.status,
      confidence: p.confidence,
      payload: p.payload,
      sourceRef: p.sourceRef,
      createdByAgent: p.createdByAgent,
      reviewedByUser: p.reviewedByUser,
      reviewedAt: p.reviewedAt,
      relatedAgentRunId: p.relatedAgentRunId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      appliedAt: p.appliedAt,
      appliedBy: p.appliedBy,
    })),
    null,
    2
  );
}

export default { name: 'list-concierge-proposals', schema: listConciergeProposalsSchema, execute };

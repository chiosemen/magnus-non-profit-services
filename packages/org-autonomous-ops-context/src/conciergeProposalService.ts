/**
 * Magnus S4NP — AI Concierge Proposal Service Layer
 */

import { PrismaClient, ConciergeProposalStatus, ConciergeProposalType, ConciergeProposal } from '@magnus/db/types';

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

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface CreateProposalInput {
  type: ConciergeProposalType;
  confidence: number;
  payload: any;
  sourceRef?: string;
  createdByAgent?: string;
  relatedAgentRunId?: string;
}

/**
 * Creates a new AI proposal in PENDING_REVIEW status.
 */
export async function createProposal(
  db: PrismaClient,
  orgId: string,
  input: CreateProposalInput
): Promise<ConciergeProposal> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (input.confidence < 0 || input.confidence > 1) {
    throw new ValidationError('Confidence score must be between 0.0 and 1.0.');
  }
  if (!input.payload || typeof input.payload !== 'object') {
    throw new ValidationError('Proposal payload is required and must be an object.');
  }

  // Validate agent run if provided
  if (input.relatedAgentRunId) {
    const run = await db.agentRun.findFirst({
      where: { id: input.relatedAgentRunId }
    });
    if (!run) {
      throw new ValidationError(`Agent run ID ${input.relatedAgentRunId} not found.`);
    }
  }

  return await db.conciergeProposal.create({
    data: {
      orgId,
      type: input.type,
      status: ConciergeProposalStatus.PENDING_REVIEW,
      confidence: input.confidence,
      payload: input.payload,
      sourceRef: input.sourceRef || null,
      createdByAgent: input.createdByAgent || null,
      relatedAgentRunId: input.relatedAgentRunId || null,
    },
  });
}

/**
 * Lists proposals for an organization, optionally filtering by status and type.
 */
export async function listProposals(
  db: PrismaClient,
  orgId: string,
  options: { status?: ConciergeProposalStatus; type?: ConciergeProposalType } = {}
): Promise<ConciergeProposal[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');

  return await db.conciergeProposal.findMany({
    where: {
      orgId,
      status: options.status,
      type: options.type,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Updates a proposal's status. Transition rules:
 * - Only PENDING_REVIEW can be APPROVED or REJECTED.
 * - Approved proposals can be marked REJECTED if they haven't been applied.
 * - Proposals cannot be directly marked APPLIED without using applyProposal.
 */
export async function updateProposalStatus(
  db: PrismaClient,
  orgId: string,
  proposalId: string,
  status: ConciergeProposalStatus,
  actorName: string
): Promise<ConciergeProposal> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!actorName?.trim()) throw new ValidationError('Actor name is required for audit trails.');

  const proposal = await db.conciergeProposal.findFirst({
    where: { id: proposalId, orgId },
  });

  if (!proposal) throw new NotFoundError('Proposal not found.');

  // Validate status transition rules
  if (status === ConciergeProposalStatus.APPLIED) {
    throw new ValidationError('Proposals cannot be directly marked APPLIED. Use applyProposal instead.');
  }

  if (proposal.status === ConciergeProposalStatus.APPLIED) {
    throw new ValidationError('Cannot modify status of a proposal that has already been applied.');
  }

  if (proposal.status === ConciergeProposalStatus.REJECTED && status !== ConciergeProposalStatus.PENDING_REVIEW) {
    throw new ValidationError('Rejected proposals can only transition back to PENDING_REVIEW.');
  }

  const updated = await db.conciergeProposal.update({
    where: { id: proposalId },
    data: {
      status,
      reviewedByUser: actorName.trim(),
      reviewedAt: new Date(),
    },
  });

  return updated;
}

/**
 * Executes/applies an approved proposal, running the executor callback inside a transaction.
 */
export async function applyProposal<T>(
  db: PrismaClient,
  orgId: string,
  proposalId: string,
  executorFn: (payload: any) => Promise<T>,
  actorName: string
): Promise<{ proposal: ConciergeProposal; result: T }> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!actorName?.trim()) throw new ValidationError('Actor name is required for audit trails.');

  const proposal = await db.conciergeProposal.findFirst({
    where: { id: proposalId, orgId },
  });

  if (!proposal) throw new NotFoundError('Proposal not found.');

  if (proposal.status !== ConciergeProposalStatus.APPROVED) {
    throw new ValidationError(`Proposal must be in APPROVED status to be applied. Current status is ${proposal.status}.`);
  }

  // Execute transaction to run callback and transition status to APPLIED
  return await db.$transaction(async (tx) => {
    // 1. Run the executor function which performs actual mutation
    const result = await executorFn(proposal.payload);

    // 2. Mark proposal as applied and log audit parameters
    const updatedProposal = await tx.conciergeProposal.update({
      where: { id: proposalId },
      data: {
        status: ConciergeProposalStatus.APPLIED,
        appliedAt: new Date(),
        appliedBy: actorName.trim(),
      },
    });

    return { proposal: updatedProposal, result };
  });
}

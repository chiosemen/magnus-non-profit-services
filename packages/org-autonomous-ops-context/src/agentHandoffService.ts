import type { AgentHandoffStatus, Prisma, PrismaClient } from '@magnus/db/types';

export const HANDOFF_AUDIT_ACTIONS = {
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
} as const;

const ALLOWED_TRANSITIONS: Record<AgentHandoffStatus, AgentHandoffStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['RESOLVED', 'CANCELLED'],
  RESOLVED: [],
  CANCELLED: [],
};

export type CreateHandoffInput = {
  fromAgentName: string;
  toAgentName: string;
  title: string;
  body: string;
  urgency?: string;
  requiresHumanReview?: boolean;
  sourceEvidence?: unknown;
  relatedAgentRunId?: string | null;
};

export type TransitionHandoffInput = {
  handoffId: string;
  toStatus: AgentHandoffStatus;
  actorType: 'agent' | 'user' | 'system';
  actorName?: string | null;
  detail?: Record<string, unknown> | null;
};

export const MAX_HANDOFF_TITLE_CHARS = 500;
export const MAX_HANDOFF_BODY_BYTES = 128_000;

export class AgentHandoffService {
  constructor(private readonly db: PrismaClient) {}

  private async assertOrgExists(orgId: string): Promise<void> {
    const o = await this.db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!o) throw new Error('ORG_NOT_FOUND');
  }

  private validateSourceEvidence(raw: unknown): Prisma.InputJsonValue | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!Array.isArray(raw)) throw new Error('INVALID_SOURCE_EVIDENCE');
    return raw as Prisma.InputJsonValue;
  }

  async create(orgId: string, input: CreateHandoffInput) {
    await this.assertOrgExists(orgId);
    const title = input.title.trim();
    if (!title) throw new Error('TITLE_REQUIRED');
    if (title.length > MAX_HANDOFF_TITLE_CHARS) throw new Error('TITLE_TOO_LONG');
    if (Buffer.byteLength(input.body, 'utf8') > MAX_HANDOFF_BODY_BYTES) throw new Error('BODY_TOO_LARGE');

    if (input.relatedAgentRunId) {
      const run = await this.db.agentRun.findUnique({
        where: { id: input.relatedAgentRunId },
        select: { scopeType: true, scopeId: true },
      });
      if (!run || run.scopeType !== 'ORG' || run.scopeId !== orgId) {
        throw new Error('INVALID_RELATED_RUN');
      }
    }

    const sourceEvidence = this.validateSourceEvidence(input.sourceEvidence);

    const handoff = await this.db.agentHandoff.create({
      data: {
        orgId,
        fromAgentName: input.fromAgentName.trim(),
        toAgentName: input.toAgentName.trim(),
        title,
        body: input.body,
        urgency: (input.urgency ?? 'normal').slice(0, 32) || 'normal',
        requiresHumanReview: input.requiresHumanReview ?? false,
        sourceEvidence,
        relatedAgentRunId: input.relatedAgentRunId ?? undefined,
        status: 'OPEN',
      },
    });

    await this.db.agentHandoffAuditEntry.create({
      data: {
        handoffId: handoff.id,
        action: HANDOFF_AUDIT_ACTIONS.CREATED,
        fromStatus: null,
        toStatus: 'OPEN',
        actorType: 'system',
        actorName: input.fromAgentName.trim(),
        detail: { sourceEvidence: input.sourceEvidence ?? null } as Prisma.InputJsonValue,
      },
    });

    return handoff;
  }

  async transition(orgId: string, input: TransitionHandoffInput) {
    await this.assertOrgExists(orgId);
    const h = await this.db.agentHandoff.findFirst({
      where: { id: input.handoffId, orgId },
    });
    if (!h) throw new Error('HANDOFF_NOT_FOUND');

    const next = input.toStatus;
    const allowed = ALLOWED_TRANSITIONS[h.status];
    if (!allowed.includes(next)) throw new Error('INVALID_TRANSITION');

    const updated = await this.db.agentHandoff.update({
      where: { id: h.id },
      data: {
        status: next,
        resolvedAt: next === 'RESOLVED' || next === 'CANCELLED' ? new Date() : h.resolvedAt,
      },
    });

    await this.db.agentHandoffAuditEntry.create({
      data: {
        handoffId: h.id,
        action: HANDOFF_AUDIT_ACTIONS.STATUS_CHANGED,
        fromStatus: h.status,
        toStatus: next,
        actorType: input.actorType,
        actorName: input.actorName ?? undefined,
        detail: input.detail === undefined || input.detail === null ? undefined : (input.detail as Prisma.InputJsonValue),
      },
    });

    return updated;
  }

  async list(orgId: string, filter?: { status?: AgentHandoffStatus; toAgentName?: string }) {
    await this.assertOrgExists(orgId);
    return this.db.agentHandoff.findMany({
      where: {
        orgId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.toAgentName ? { toAgentName: filter.toAgentName } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(orgId: string, handoffId: string) {
    await this.assertOrgExists(orgId);
    const h = await this.db.agentHandoff.findFirst({ where: { id: handoffId, orgId } });
    if (!h) throw new Error('HANDOFF_NOT_FOUND');
    return h;
  }

  async listAudit(orgId: string, handoffId: string) {
    await this.get(orgId, handoffId);
    return this.db.agentHandoffAuditEntry.findMany({
      where: { handoffId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

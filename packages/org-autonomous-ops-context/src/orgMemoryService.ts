import type { Prisma, PrismaClient } from '@magnus/db/types';

/** Returned on reads so clients never treat memory as silent truth. */
export const AUTONOMOUS_OPS_MEMORY_DISCLAIMER =
  'Autonomous Ops memory is supplementary, may be incomplete or wrong, and is not authoritative. Always verify against primary systems and policies.';

export type AppendOperationalMemoryInput = {
  agentName: string;
  kind: string;
  payload: unknown;
  sourceRefs?: unknown;
  agentRunId?: string | null;
  confidence?: number | null;
};

export type CreateCuratedMemoryInput = {
  title?: string | null;
  body: string;
  confidence?: number;
  sourceRefs?: unknown;
  createdBy?: string | null;
};

export type IngestSemanticChunkInput = {
  chunkText: string;
  confidence?: number;
  sourceRefs?: unknown;
};

export type MemorySourceRef = {
  type: string;
  [k: string]: unknown;
};

export type MemorySourceRefs = MemorySourceRef[];

const MAX_OPERATIONAL_KIND_LEN = 120;
const MAX_AGENT_NAME_LEN = 120;
const MAX_CURATED_BODY = 256_000;
const MAX_SEMANTIC_CHUNK = 256_000;
const DEFAULT_LIST_LIMIT = 200;
const MAX_SOURCE_REFS = 120;

export class OrgMemoryService {
  constructor(private readonly db: PrismaClient) {}

  private async assertOrgExists(orgId: string): Promise<void> {
    const o = await this.db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!o) throw new Error('ORG_NOT_FOUND');
  }

  private clampConfidence01(c: number | undefined | null): number | null {
    if (c === undefined || c === null) return null;
    if (Number.isNaN(c)) throw new Error('INVALID_CONFIDENCE');
    return Math.min(1, Math.max(0, c));
  }

  private validateConfidenceRequired(c: number): number {
    const v = this.clampConfidence01(c);
    if (v === null) throw new Error('INVALID_CONFIDENCE');
    return v;
  }

  private validateSourceRefs(raw: unknown): Prisma.InputJsonValue | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!Array.isArray(raw)) throw new Error('INVALID_SOURCE_REFS');
    if (raw.length > MAX_SOURCE_REFS) throw new Error('INVALID_SOURCE_REFS');
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('INVALID_SOURCE_REFS');
      const t = (item as { type?: unknown }).type;
      if (typeof t !== 'string' || !t.trim()) throw new Error('INVALID_SOURCE_REFS');
      if (t.trim().length > 80) throw new Error('INVALID_SOURCE_REFS');
    }
    return raw as Prisma.InputJsonValue;
  }

  async appendOperational(orgId: string, input: AppendOperationalMemoryInput) {
    await this.assertOrgExists(orgId);
    const agentName = input.agentName.trim().slice(0, MAX_AGENT_NAME_LEN);
    const kind = input.kind.trim().slice(0, MAX_OPERATIONAL_KIND_LEN);
    if (!agentName || !kind) throw new Error('INVALID_OPERATIONAL_FIELDS');

    if (input.agentRunId) {
      const run = await this.db.agentRun.findUnique({
        where: { id: input.agentRunId },
        select: { scopeType: true, scopeId: true },
      });
      if (!run || run.scopeType !== 'ORG' || run.scopeId !== orgId) {
        throw new Error('INVALID_RELATED_RUN');
      }
    }

    return this.db.agentOperationalMemoryEntry.create({
      data: {
        orgId,
        agentName,
        kind,
        payload: input.payload as Prisma.InputJsonValue,
        sourceRefs: this.validateSourceRefs(input.sourceRefs),
        agentRunId: input.agentRunId ?? undefined,
        confidence: this.clampConfidence01(input.confidence ?? null),
        recallDisabled: false,
      },
    });
  }

  async listOperational(orgId: string, opts?: { includeRecallDisabled?: boolean; take?: number }) {
    await this.assertOrgExists(orgId);
    const take = Math.min(opts?.take ?? DEFAULT_LIST_LIMIT, 500);
    return this.db.agentOperationalMemoryEntry.findMany({
      where: {
        orgId,
        ...(opts?.includeRecallDisabled ? {} : { recallDisabled: false }),
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async setOperationalRecallDisabled(
    orgId: string,
    entryId: string,
    disabled: boolean,
    reason?: string | null,
  ) {
    await this.assertOrgExists(orgId);
    const row = await this.db.agentOperationalMemoryEntry.findFirst({ where: { id: entryId, orgId } });
    if (!row) throw new Error('ENTRY_NOT_FOUND');
    if (disabled) {
      const r = reason?.trim() ?? '';
      if (!r) throw new Error('RECALL_DISABLED_REASON_REQUIRED');
    }
    return this.db.agentOperationalMemoryEntry.update({
      where: { id: entryId },
      data: {
        recallDisabled: disabled,
        recallDisabledReason: disabled ? (reason?.trim() ?? null) : null,
      },
    });
  }

  async createCurated(orgId: string, input: CreateCuratedMemoryInput) {
    await this.assertOrgExists(orgId);
    const body = input.body.trim();
    if (!body) throw new Error('BODY_REQUIRED');
    if (Buffer.byteLength(body, 'utf8') > MAX_CURATED_BODY) throw new Error('BODY_TOO_LARGE');

    const confidence = this.validateConfidenceRequired(
      input.confidence !== undefined ? input.confidence : 0.5,
    );

    return this.db.orgCuratedMemoryItem.create({
      data: {
        orgId,
        title: input.title?.trim() ? input.title.trim().slice(0, 500) : null,
        body,
        confidence,
        sourceRefs: this.validateSourceRefs(input.sourceRefs),
        isActive: true,
        createdBy: input.createdBy?.trim() || null,
      },
    });
  }

  async listCurated(orgId: string, opts?: { includeInactive?: boolean; take?: number }) {
    await this.assertOrgExists(orgId);
    const take = Math.min(opts?.take ?? DEFAULT_LIST_LIMIT, 500);
    return this.db.orgCuratedMemoryItem.findMany({
      where: {
        orgId,
        ...(opts?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  async deactivateCurated(orgId: string, itemId: string) {
    await this.assertOrgExists(orgId);
    const row = await this.db.orgCuratedMemoryItem.findFirst({ where: { id: itemId, orgId } });
    if (!row) throw new Error('ITEM_NOT_FOUND');
    return this.db.orgCuratedMemoryItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
  }

  async ingestSemanticChunk(orgId: string, input: IngestSemanticChunkInput) {
    await this.assertOrgExists(orgId);
    const chunkText = input.chunkText.trim();
    if (!chunkText) throw new Error('CHUNK_REQUIRED');
    if (Buffer.byteLength(chunkText, 'utf8') > MAX_SEMANTIC_CHUNK) throw new Error('CHUNK_TOO_LARGE');

    const confidence = this.validateConfidenceRequired(
      input.confidence !== undefined ? input.confidence : 0.4,
    );

    return this.db.orgSemanticMemoryChunk.create({
      data: {
        orgId,
        chunkText,
        confidence,
        sourceRefs: this.validateSourceRefs(input.sourceRefs),
        embeddingReady: false,
      },
    });
  }

  async searchSemantic(orgId: string, query: string, limit = 20) {
    await this.assertOrgExists(orgId);
    const q = query.trim();
    const cap = Math.min(Math.max(limit, 1), 50);
    if (!q) {
      return {
        matchMode: 'none' as const,
        semanticReady: false,
        embeddingReady: false,
        disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER,
        chunks: [] as const,
      };
    }

    const chunks = await this.db.orgSemanticMemoryChunk.findMany({
      where: {
        orgId,
        chunkText: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: cap,
    });

    return {
      matchMode: 'keyword_insensitive_contains' as const,
      semanticReady: false,
      embeddingReady: chunks.some(c => c.embeddingReady),
      disclaimer: AUTONOMOUS_OPS_MEMORY_DISCLAIMER,
      chunks: chunks.map(c => ({
        id: c.id,
        chunkText: c.chunkText,
        confidence: c.confidence,
        sourceRefs: c.sourceRefs,
        embeddingReady: c.embeddingReady,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}

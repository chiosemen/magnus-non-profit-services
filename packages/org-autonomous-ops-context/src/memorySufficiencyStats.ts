import type { PrismaClient } from '@magnus/db/types';
import type { MemorySufficiencyStats } from './memorySufficiency';

/**
 * Loads the same aggregates used by `/api/org/autonomous-ops/memory/sufficiency`
 * so readiness and API stay aligned.
 */
export async function loadMemorySufficiencyStatsForOrg(
  db: PrismaClient,
  orgId: string,
): Promise<MemorySufficiencyStats> {
  const [
    opAgg,
    opSourceRefsCount,
    opAgentKinds,
    curatedActiveCount,
    semanticAgg,
    semanticEmbeddingReadyCount,
  ] = await Promise.all([
    db.agentOperationalMemoryEntry.aggregate({
      where: { orgId, recallDisabled: false },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    db.agentOperationalMemoryEntry.count({
      where: { orgId, recallDisabled: false, sourceRefs: { not: null } as any },
    }),
    db.agentOperationalMemoryEntry.groupBy({
      by: ['agentName', 'kind'],
      where: { orgId, recallDisabled: false },
      _count: { _all: true },
    }),
    db.orgCuratedMemoryItem.count({
      where: { orgId, isActive: true },
    }),
    db.orgSemanticMemoryChunk.aggregate({
      where: { orgId },
      _count: { _all: true },
    }),
    db.orgSemanticMemoryChunk.count({ where: { orgId, embeddingReady: true } }),
  ]);

  const totalEntries = opAgg._count?._all ?? 0;
  const minAt = opAgg._min?.createdAt ?? null;
  const maxAt = opAgg._max?.createdAt ?? null;
  const spanDays =
    minAt && maxAt ? Math.floor((maxAt.getTime() - minAt.getTime()) / 86400000) : totalEntries > 0 ? 0 : null;

  const agentSet = new Set(opAgentKinds.map(r => r.agentName));

  return {
    operational: {
      totalEntries,
      spanDays,
      agentsSeen: agentSet.size,
      withSourceRefs: opSourceRefsCount,
    },
    curated: {
      activeItems: curatedActiveCount,
    },
    semantic: {
      chunks: semanticAgg._count?._all ?? 0,
      embeddingReadyChunks: semanticEmbeddingReadyCount,
    },
  };
}

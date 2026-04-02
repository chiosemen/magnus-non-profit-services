export type MemorySufficiencyThresholds = {
  operationalMinEntries: number;
  operationalMinSpanDays: number;
  operationalMinAgents: number;
  operationalMinSourceRefsCoverage: number; // 0..1
  curatedMinActiveItems: number;
  semanticMinChunks: number;
};

export const DEFAULT_MEMORY_SUFFICIENCY_THRESHOLDS: MemorySufficiencyThresholds = {
  operationalMinEntries: 30,
  operationalMinSpanDays: 21,
  operationalMinAgents: 2,
  operationalMinSourceRefsCoverage: 0.9,
  curatedMinActiveItems: 1,
  semanticMinChunks: 5,
};

export type MemorySufficiencyStats = {
  operational: {
    totalEntries: number;
    spanDays: number | null;
    agentsSeen: number;
    withSourceRefs: number;
  };
  curated: {
    activeItems: number;
  };
  semantic: {
    chunks: number;
    embeddingReadyChunks: number;
  };
};

export type MemorySufficiencyEvaluation = {
  thresholds: MemorySufficiencyThresholds;
  stats: MemorySufficiencyStats;
  /** GO only when thresholds are met; otherwise explicitly NO_GO. */
  readiness: 'GO' | 'NO_GO';
  reasons: string[];
};

export function evaluateMemorySufficiency(params: {
  stats: MemorySufficiencyStats;
  thresholds?: MemorySufficiencyThresholds;
}): MemorySufficiencyEvaluation {
  const thresholds = params.thresholds ?? DEFAULT_MEMORY_SUFFICIENCY_THRESHOLDS;
  const s = params.stats;
  const reasons: string[] = [];

  const op = s.operational;
  const sourceRefsCoverage = op.totalEntries > 0 ? op.withSourceRefs / op.totalEntries : 0;

  if (op.totalEntries < thresholds.operationalMinEntries) reasons.push('operational_entries_below_min');
  if (op.spanDays === null || op.spanDays < thresholds.operationalMinSpanDays) reasons.push('operational_span_below_min');
  if (op.agentsSeen < thresholds.operationalMinAgents) reasons.push('operational_agents_below_min');
  if (sourceRefsCoverage < thresholds.operationalMinSourceRefsCoverage) reasons.push('operational_sourceRefs_coverage_below_min');

  if (s.curated.activeItems < thresholds.curatedMinActiveItems) reasons.push('curated_active_items_below_min');

  // Semantic memory is explicitly non-authoritative scaffold until populated; do not require embeddings.
  if (s.semantic.chunks < thresholds.semanticMinChunks) reasons.push('semantic_chunks_below_min');

  return {
    thresholds,
    stats: s,
    readiness: reasons.length === 0 ? 'GO' : 'NO_GO',
    reasons,
  };
}


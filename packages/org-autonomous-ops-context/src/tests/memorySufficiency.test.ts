import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMemorySufficiency } from '../memorySufficiency';

test('evaluateMemorySufficiency is NO_GO until thresholds are met', () => {
  const r = evaluateMemorySufficiency({
    stats: {
      operational: { totalEntries: 5, spanDays: 3, agentsSeen: 1, withSourceRefs: 2 },
      curated: { activeItems: 0 },
      semantic: { chunks: 0, embeddingReadyChunks: 0 },
    },
  });
  assert.equal(r.readiness, 'NO_GO');
  assert.ok(r.reasons.includes('operational_entries_below_min'));
  assert.ok(r.reasons.includes('operational_span_below_min'));
  assert.ok(r.reasons.includes('operational_agents_below_min'));
  assert.ok(r.reasons.includes('operational_sourceRefs_coverage_below_min'));
  assert.ok(r.reasons.includes('curated_active_items_below_min'));
  assert.ok(r.reasons.includes('semantic_chunks_below_min'));
});

test('evaluateMemorySufficiency is GO when all thresholds are met', () => {
  const r = evaluateMemorySufficiency({
    thresholds: {
      operationalMinEntries: 2,
      operationalMinSpanDays: 7,
      operationalMinAgents: 2,
      operationalMinSourceRefsCoverage: 0.9,
      curatedMinActiveItems: 1,
      semanticMinChunks: 1,
    },
    stats: {
      operational: { totalEntries: 10, spanDays: 14, agentsSeen: 2, withSourceRefs: 10 },
      curated: { activeItems: 1 },
      semantic: { chunks: 1, embeddingReadyChunks: 0 },
    },
  });
  assert.equal(r.readiness, 'GO');
  assert.deepEqual(r.reasons, []);
});


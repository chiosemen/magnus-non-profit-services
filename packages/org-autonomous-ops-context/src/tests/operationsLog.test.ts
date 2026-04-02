import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@magnus/db/types';
import { buildOperationsLog } from '../operationsLog';

function makeDb(): PrismaClient {
  const now = new Date('2026-04-02T12:00:00.000Z');
  const db: any = {
    alertAuditEntry: {
      findMany: async () => [
        {
          id: 'aa1',
          alertId: 'a1',
          createdAt: new Date('2026-04-02T10:00:00.000Z'),
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'OPEN',
          actorType: 'agent',
          actorName: 'ComplianceWatchdog',
          detail: { dedupeKey: 'k' },
          alert: { agentName: 'ComplianceWatchdog', type: 'T', title: 'Renewal gap', status: 'OPEN' },
        },
      ],
    },
    agentHandoffAuditEntry: {
      findMany: async () => [
        {
          id: 'ha1',
          handoffId: 'h1',
          createdAt: new Date('2026-04-02T11:00:00.000Z'),
          action: 'STATUS_CHANGED',
          fromStatus: 'OPEN',
          toStatus: 'ACKNOWLEDGED',
          actorType: 'user',
          actorName: 'staff-1',
          detail: { resolutionSummary: 'x', handoffRequiresHumanReview: true, relatedAgentRunId: 'r1' },
          handoff: {
            fromAgentName: 'ComplianceWatchdog',
            toAgentName: 'BoardIntelligenceOracle',
            title: 'Triage',
            status: 'ACKNOWLEDGED',
            requiresHumanReview: true,
            relatedAgentRunId: 'r1',
          },
        },
      ],
    },
    agentRun: {
      findMany: async () => [
        {
          id: 'r1',
          agentName: 'ComplianceWatchdog',
          status: 'FAILED',
          startedAt: new Date('2026-04-02T09:00:00.000Z'),
          finishedAt: new Date('2026-04-02T09:01:00.000Z'),
          error: 'AUTONOMY_BLOCKED:handoff:tier_c_never',
          metrics: { autonomyTrace: { decision: 'BLOCKED_INTERNAL_EFFECT', effect: 'handoff', reasonCode: 'tier_c_never' } },
          autonomyTier: 'TIER_C_NEVER',
          requiresHumanReview: true,
        },
      ],
    },
  };
  // Ensure we don't accidentally call obligation builder in this test.
  db.__now = now;
  return db as PrismaClient;
}

test('buildOperationsLog merges alert audits, handoff audits, and runs', async () => {
  const db = makeDb();
  const res = await buildOperationsLog({
    db,
    orgId: 'org1',
    take: 50,
    includeObligationSnapshot: false,
    now: new Date('2026-04-02T12:00:00.000Z'),
  });
  assert.equal(res.orgId, 'org1');
  assert.ok(Array.isArray(res.rows));
  assert.ok(res.rows.some(r => r.type === 'ALERT_CREATED'));
  assert.ok(res.rows.some(r => r.type === 'HANDOFF_STATUS_CHANGED'));
  assert.ok(res.rows.some(r => r.type === 'AGENT_RUN_FAILED'));
  assert.ok(res.rows.some(r => r.type === 'AUTONOMY_BLOCKED_INTERNAL_EFFECT'));
});

test('buildOperationsLog filters by agentNames and types', async () => {
  const db = makeDb();
  const res = await buildOperationsLog({
    db,
    orgId: 'org1',
    take: 50,
    includeObligationSnapshot: false,
    agentNames: ['ComplianceWatchdog'],
    types: ['ALERT_CREATED'],
    now: new Date('2026-04-02T12:00:00.000Z'),
  });
  assert.ok(res.rows.length >= 1);
  assert.ok(res.rows.every(r => r.type === 'ALERT_CREATED'));
});


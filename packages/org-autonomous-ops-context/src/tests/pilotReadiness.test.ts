import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@magnus/db/types';
import { buildPilotReadiness, rollUpPilotReadiness, type PilotReadinessDimension } from '../pilotReadiness';

test('rollUpPilotReadiness picks worst status and flags pilotCandidate', () => {
  const dims: PilotReadinessDimension[] = [
    { id: 'subscription_active', label: 'S', status: 'READY', blockers: [], notes: [] },
    { id: 'org_identity_context', label: 'I', status: 'PARTIAL', blockers: ['x'], notes: [] },
  ];
  const r = rollUpPilotReadiness(dims);
  assert.equal(r.summary, 'PARTIAL');
  assert.equal(r.pilotCandidate, true);
  assert.ok(r.blockers.some(b => b.startsWith('org_identity_context:')));
});

test('rollUpPilotReadiness: critical NOT_CONFIGURED blocks pilotCandidate', () => {
  const dims: PilotReadinessDimension[] = [
    { id: 'subscription_active', label: 'S', status: 'READY', blockers: [], notes: [] },
    { id: 'claude_connector', label: 'C', status: 'NOT_CONFIGURED', blockers: ['c'], notes: [] },
  ];
  const r = rollUpPilotReadiness(dims);
  assert.equal(r.summary, 'NOT_CONFIGURED');
  assert.equal(r.pilotCandidate, false);
});

test('buildPilotReadiness returns org snapshot when org missing', async () => {
  const db: any = {
    organization: {
      findUnique: async () => null,
    },
    agentOperationalMemoryEntry: {
      aggregate: async () => ({ _count: { _all: 0 }, _min: null, _max: null }),
      count: async () => 0,
      groupBy: async () => [],
    },
    orgCuratedMemoryItem: { count: async () => 0 },
    orgSemanticMemoryChunk: { aggregate: async () => ({ _count: { _all: 0 } }), count: async () => 0 },
  };
  const snap = await buildPilotReadiness({ db: db as PrismaClient, orgId: 'missing' });
  assert.equal(snap.dimensions[0].id, 'org_exists');
  assert.equal(snap.overall.pilotCandidate, false);
});

test('buildPilotReadiness example shape (all mocked READY-ish)', async () => {
  const kinds = [
    'ORG_IDENTITY',
    'ORG_SOUL',
    'ORG_AGENTS',
    'ORG_MEMORY',
    'ORG_HEARTBEAT',
  ] as const;
  const content = 'x'.repeat(40);
  const db: any = {
    organization: {
      findUnique: async () => ({
        subscriptionTier: 'GROWTH',
        subscriptionStatus: 'ACTIVE',
        claudeStatus: 'ACTIVE',
        stripeAccountId: 'acct_1',
      }),
    },
    orgAutonomousOpsSettings: {
      findUnique: async () => ({ enabledAgents: ['ComplianceWatchdog'] }),
    },
    orgContextFile: {
      findMany: async () => kinds.map(kind => ({ kind, content })),
    },
    agentOperationalMemoryEntry: {
      aggregate: async () => ({
        _count: { _all: 40 },
        _min: { createdAt: new Date('2026-01-01') },
        _max: { createdAt: new Date('2026-03-01') },
      }),
      count: async () => 40,
      groupBy: async () => [
        { agentName: 'AgentA', kind: 'note', _count: { _all: 20 } },
        { agentName: 'AgentB', kind: 'note', _count: { _all: 20 } },
      ],
    },
    orgCuratedMemoryItem: { count: async () => 1 },
    orgSemanticMemoryChunk: { aggregate: async () => ({ _count: { _all: 8 } }), count: async () => 0 },
    donorEvent: { aggregate: async () => ({ _count: { _all: 1 } }) },
    volunteerEvent: { aggregate: async () => ({ _count: { _all: 0 } }) },
    alert: { findMany: async () => [] },
    agentHandoff: { findMany: async () => [] },
    complianceCalendar: { findMany: async () => [] },
  };
  const snap = await buildPilotReadiness({ db: db as PrismaClient, orgId: 'org1' });
  assert.equal(snap.orgId, 'org1');
  assert.ok(snap.dimensions.length >= 6);
  assert.equal(snap.memoryEvaluation.readiness, 'GO');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AgentHandoff, AgentHandoffStatus, PrismaClient } from '@magnus/db/types';
import { AgentHandoffService, HANDOFF_AUDIT_ACTIONS } from '../agentHandoffService';

type AuditRow = {
  id: string;
  handoffId: string;
  createdAt: Date;
  action: string;
  fromStatus: AgentHandoffStatus | null;
  toStatus: AgentHandoffStatus | null;
  actorType: string;
  actorName: string | null;
  detail: unknown;
};

function makeFixture() {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const handoffs = new Map<string, AgentHandoff>();
  const audits: AuditRow[] = [];

  const db = {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    agentRun: {
      findUnique: async () => null,
    },
    agentHandoff: {
      findFirst: async (args: { where: { id?: string; orgId?: string } }) => {
        const h = handoffs.get(args.where.id ?? '');
        if (!h || h.orgId !== args.where.orgId) return null;
        return h;
      },
      findMany: async (args: { where: { orgId: string; status?: AgentHandoffStatus; toAgentName?: string } }) =>
        [...handoffs.values()].filter(h => {
          if (h.orgId !== args.where.orgId) return false;
          if (args.where.status !== undefined && h.status !== args.where.status) return false;
          if (args.where.toAgentName !== undefined && h.toAgentName !== args.where.toAgentName) return false;
          return true;
        }),
      create: async (args: { data: Record<string, unknown> }) => {
        const id = randomUUID();
        const h = {
          id,
          orgId: args.data.orgId,
          fromAgentName: args.data.fromAgentName,
          toAgentName: args.data.toAgentName,
          title: args.data.title,
          body: args.data.body,
          urgency: args.data.urgency ?? 'normal',
          requiresHumanReview: args.data.requiresHumanReview ?? false,
          status: args.data.status as AgentHandoffStatus,
          sourceEvidence: args.data.sourceEvidence ?? null,
          relatedAgentRunId: args.data.relatedAgentRunId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          resolvedAt: null as Date | null,
        } as unknown as AgentHandoff;
        handoffs.set(id, h);
        return h;
      },
      update: async (args: { where: { id: string }; data: { status: AgentHandoffStatus; resolvedAt?: Date | null } }) => {
        const h = handoffs.get(args.where.id);
        if (!h) throw new Error('missing');
        const next = { ...h, ...args.data, updatedAt: new Date() } as AgentHandoff;
        handoffs.set(args.where.id, next);
        return next;
      },
    },
    agentHandoffAuditEntry: {
      create: async (args: { data: Record<string, unknown> }) => {
        const row: AuditRow = {
          id: randomUUID(),
          handoffId: args.data.handoffId as string,
          createdAt: new Date(),
          action: args.data.action as string,
          fromStatus: (args.data.fromStatus as AgentHandoffStatus | null) ?? null,
          toStatus: (args.data.toStatus as AgentHandoffStatus | null) ?? null,
          actorType: args.data.actorType as string,
          actorName: (args.data.actorName as string | null) ?? null,
          detail: args.data.detail ?? null,
        };
        audits.push(row);
        return row;
      },
      findMany: async (args: { where: { handoffId: string }; orderBy: { createdAt: string } }) =>
        audits.filter(a => a.handoffId === args.where.handoffId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
  };

  return { db: db as unknown as PrismaClient, handoffs, audits, orgId };
}

test('create writes handoff and CREATED audit with OPEN', async () => {
  const { db, audits, orgId } = makeFixture();
  const svc = new AgentHandoffService(db);
  const h = await svc.create(orgId, {
    fromAgentName: 'ComplianceWatchdog',
    toAgentName: 'BoardIntelligenceOracle',
    title: 'Renewal gap',
    body: 'Details here.',
    sourceEvidence: [{ type: 'compliance_row', id: 'c1', label: 'CA charity' }],
    requiresHumanReview: true,
  });
  assert.equal(h.status, 'OPEN');
  assert.equal(h.requiresHumanReview, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, HANDOFF_AUDIT_ACTIONS.CREATED);
  assert.equal(audits[0]?.toStatus, 'OPEN');
});

test('transition records STATUS_CHANGED audit and updates status', async () => {
  const { db, audits, orgId } = makeFixture();
  const svc = new AgentHandoffService(db);
  const h = await svc.create(orgId, {
    fromAgentName: 'A',
    toAgentName: 'B',
    title: 'T',
    body: 'B',
  });
  const n = audits.length;
  await svc.transition(orgId, {
    handoffId: h.id,
    toStatus: 'ACKNOWLEDGED',
    actorType: 'agent',
    actorName: 'B',
  });
  const updated = await svc.get(orgId, h.id);
  assert.equal(updated.status, 'ACKNOWLEDGED');
  assert.equal(audits.length, n + 1);
  assert.equal(audits[audits.length - 1]?.action, HANDOFF_AUDIT_ACTIONS.STATUS_CHANGED);
  assert.equal(audits[audits.length - 1]?.fromStatus, 'OPEN');
  assert.equal(audits[audits.length - 1]?.toStatus, 'ACKNOWLEDGED');
});

test('invalid transition is rejected', async () => {
  const { db, orgId } = makeFixture();
  const svc = new AgentHandoffService(db);
  const h = await svc.create(orgId, {
    fromAgentName: 'A',
    toAgentName: 'B',
    title: 'T',
    body: 'B',
  });
  await assert.rejects(
    () =>
      svc.transition(orgId, {
        handoffId: h.id,
        toStatus: 'RESOLVED',
        actorType: 'agent',
      }),
    /INVALID_TRANSITION/,
  );
});

test('listAudit returns chronological entries', async () => {
  const { db, orgId } = makeFixture();
  const svc = new AgentHandoffService(db);
  const h = await svc.create(orgId, {
    fromAgentName: 'A',
    toAgentName: 'B',
    title: 'T',
    body: 'B',
  });
  await svc.transition(orgId, {
    handoffId: h.id,
    toStatus: 'ACKNOWLEDGED',
    actorType: 'user',
    actorName: 'staff-1',
  });
  const log = await svc.listAudit(orgId, h.id);
  assert.equal(log.length, 2);
  assert.match(String(log[0]?.action), /CREATED/);
  assert.match(String(log[1]?.action), /STATUS_CHANGED/);
});

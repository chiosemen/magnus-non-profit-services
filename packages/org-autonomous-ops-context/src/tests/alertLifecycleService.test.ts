import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Alert, AlertStatus, PrismaClient } from '@magnus/db/types';
import { AlertLifecycleService, ALERT_AUDIT_ACTIONS } from '../alertLifecycleService';

type AuditRow = {
  id: string;
  alertId: string;
  createdAt: Date;
  action: string;
  fromStatus: AlertStatus | null;
  toStatus: AlertStatus | null;
  actorType: string;
  actorName: string | null;
  detail: unknown;
};

function makeFixture() {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const alerts = new Map<string, Alert>();
  const audits: AuditRow[] = [];

  const db = {
    organization: { findUnique: async () => ({ id: orgId }) },
    grant: { findUnique: async () => null },
    workerOrgRelationship: { findFirst: async () => null },
    agentRun: { findUnique: async () => null },
    agentHandoff: { findFirst: async () => null },
    alert: {
      findUnique: async (args: { where: { id: string }; select?: any }) => {
        const a = alerts.get(args.where.id);
        if (!a) return null;
        if (args.select) {
          const out: any = {};
          for (const k of Object.keys(args.select)) out[k] = (a as any)[k];
          return out;
        }
        return a;
      },
      update: async (args: { where: { id: string }; data: any }) => {
        const a = alerts.get(args.where.id);
        if (!a) throw new Error('missing');
        const next = { ...a, ...args.data } as Alert;
        alerts.set(args.where.id, next);
        return next;
      },
    },
    alertAuditEntry: {
      create: async (args: { data: Record<string, unknown> }) => {
        const row: AuditRow = {
          id: randomUUID(),
          alertId: args.data.alertId as string,
          createdAt: new Date(),
          action: args.data.action as string,
          fromStatus: (args.data.fromStatus as AlertStatus | null) ?? null,
          toStatus: (args.data.toStatus as AlertStatus | null) ?? null,
          actorType: args.data.actorType as string,
          actorName: (args.data.actorName as string | null) ?? null,
          detail: args.data.detail ?? null,
        };
        audits.push(row);
        return row;
      },
      findMany: async (args: { where: { alertId: string }; orderBy: { createdAt: string } }) =>
        audits.filter(a => a.alertId === args.where.alertId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
  };

  const mkAlert = (overrides?: Partial<Alert>): Alert => {
    const id = randomUUID();
    const base: Alert = {
      id,
      agentName: 'ComplianceWatchdog',
      scopeType: 'ORG' as any,
      scopeId: orgId as any,
      severity: 'MED' as any,
      status: 'OPEN' as any,
      type: 'T',
      title: 't',
      body: 'b',
      recommendedActions: [],
      dedupeKey: `ComplianceWatchdog:org:${orgId}:T:${new Date().toISOString()}`,
      createdAt: new Date(),
      acknowledgedAt: null,
      resolvedAt: null,
      resolutionSummary: null,
      ownerType: null,
      ownerId: null,
      ownerName: null,
      relatedAgentRunId: null,
      relatedHandoffId: null,
    } as unknown as Alert;
    const a = { ...base, ...(overrides ?? {}) } as Alert;
    alerts.set(id, a);
    return a;
  };

  return { db: db as unknown as PrismaClient, orgId, mkAlert, audits };
}

test('transition enforces state machine and writes audit', async () => {
  const { db, orgId, mkAlert, audits } = makeFixture();
  const svc = new AlertLifecycleService(db);
  const a = mkAlert();

  await svc.transition(orgId, { alertId: a.id, toStatus: 'ACKNOWLEDGED', actorType: 'user', actorName: 'staff-1' });
  await svc.transition(orgId, { alertId: a.id, toStatus: 'IN_PROGRESS', actorType: 'user', actorName: 'staff-1' });
  await svc.transition(orgId, {
    alertId: a.id,
    toStatus: 'RESOLVED',
    actorType: 'user',
    actorName: 'staff-1',
    resolutionSummary: 'Confirmed in accounting and updated plan.',
  });

  assert.equal(audits.length, 3);
  assert.equal(audits[0]?.action, ALERT_AUDIT_ACTIONS.STATUS_CHANGED);
  assert.equal(audits[2]?.toStatus, 'RESOLVED');
});

test('transition to RESOLVED requires resolutionSummary', async () => {
  const { db, orgId, mkAlert } = makeFixture();
  const svc = new AlertLifecycleService(db);
  const a = mkAlert({ status: 'ACKNOWLEDGED' as any, acknowledgedAt: new Date() } as any);

  await assert.rejects(
    () => svc.transition(orgId, { alertId: a.id, toStatus: 'RESOLVED', actorType: 'user', actorName: 'staff-1' }),
    /RESOLUTION_REQUIRED/,
  );
});

test('setOwner assigns then clears with audit entries', async () => {
  const { db, orgId, mkAlert, audits } = makeFixture();
  const svc = new AlertLifecycleService(db);
  const a = mkAlert();

  await svc.setOwner(orgId, {
    alertId: a.id,
    ownerType: 'USER' as any,
    ownerId: 'u1',
    ownerName: 'staff-1',
    actorType: 'system',
    actorName: 'test',
  });
  await svc.setOwner(orgId, { alertId: a.id, ownerType: null, actorType: 'system', actorName: 'test' });

  assert.equal(audits.length, 2);
  assert.equal(audits[0]?.action, ALERT_AUDIT_ACTIONS.OWNER_ASSIGNED);
  assert.equal(audits[1]?.action, ALERT_AUDIT_ACTIONS.OWNER_CLEARED);
});


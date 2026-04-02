import test from 'node:test';
import assert from 'node:assert/strict';
import { DbAlertSink } from '../sinks/DbAlertSink';

test('DbAlertSink is idempotent on duplicate dedupeKey (P2002)', async () => {
  let calls = 0;
  const fakeDb: any = {
    alert: {
      findUnique: async () => {
        calls++;
        // 1st call: preflight check (no existing) => proceed to create
        if (calls === 1) return null;
        // 2nd call: after P2002 race => existing row matches same scope+type
        return { scopeType: 'ORG', scopeId: 'o1', type: 'DUPLICATE_TEST' };
      },
      create: async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      },
    },
    alertAuditEntry: {
      create: async () => {
        throw new Error('SHOULD_NOT_AUDIT_ON_P2002_PATH');
      },
    },
  };

  const sink = new DbAlertSink(fakeDb);
  await sink.emit({
    agentName: 'ComplianceWatchdog',
    scopeType: 'org',
    scopeId: 'o1',
    severity: 'MED',
    type: 'DUPLICATE_TEST',
    title: 't',
    body: 'b',
    recommendedActions: [],
    dedupeKey: 'ComplianceWatchdog:org:o1:DUPLICATE_TEST:2026-02-13T09:00:00.000Z',
  });

  assert.ok(true);
});

test('DbAlertSink fails closed on invalid severity', async () => {
  const fakeDb: any = {
    alert: {
      findUnique: async () => null,
      create: async () => {
        throw new Error('SHOULD_NOT_CREATE');
      },
    },
    alertAuditEntry: {
      create: async () => {
        throw new Error('SHOULD_NOT_AUDIT');
      },
    },
  };
  const sink = new DbAlertSink(fakeDb);
  await assert.rejects(
    () =>
      sink.emit({
        agentName: 'ComplianceWatchdog',
        scopeType: 'org',
        scopeId: 'o1',
        severity: 'SEVERE' as any,
        type: 'INVALID_SEV_TEST',
        title: 't',
        body: 'b',
        recommendedActions: [],
        dedupeKey: 'ComplianceWatchdog:org:o1:INVALID_SEV_TEST:2026-02-13T09:00:00.000Z',
      }),
    (err: any) => err instanceof Error && err.message === 'INVALID_ALERT_SEVERITY',
  );
});

test('DbAlertSink fails closed on invalid recommendedActions shape', async () => {
  const fakeDb: any = {
    alert: {
      findUnique: async () => null,
      create: async () => {
        throw new Error('SHOULD_NOT_CREATE');
      },
    },
    alertAuditEntry: {
      create: async () => {
        throw new Error('SHOULD_NOT_AUDIT');
      },
    },
  };
  const sink = new DbAlertSink(fakeDb);
  await assert.rejects(
    () =>
      sink.emit({
        agentName: 'ComplianceWatchdog',
        scopeType: 'org',
        scopeId: 'o1',
        severity: 'MED',
        type: 'INVALID_ACTIONS_TEST',
        title: 't',
        body: 'b',
        // not an array
        recommendedActions: { label: 'x' } as any,
        dedupeKey: 'ComplianceWatchdog:org:o1:INVALID_ACTIONS_TEST:2026-02-13T09:00:00.000Z',
      }),
    (err: any) => err instanceof Error && err.message === 'INVALID_RECOMMENDED_ACTIONS',
  );
});

test('DbAlertSink persists agentName and normalized payload', async () => {
  let created: any = null;
  const fakeDb: any = {
    alert: {
      findUnique: async () => null,
      create: async (args: any) => {
        created = args?.data ?? null;
        return { id: 'a1' };
      },
    },
    alertAuditEntry: {
      create: async () => ({ id: 'au1' }),
    },
  };
  const sink = new DbAlertSink(fakeDb);
  await sink.emit({
    agentName: 'ComplianceWatchdog',
    scopeType: 'org',
    scopeId: 'o1',
    severity: 'MED',
    type: 'PERSIST_AGENTNAME_TEST',
    title: 't',
    body: 'b',
    recommendedActions: ['Do x', { label: 'Do y', kind: 'review', url: 'https://example.invalid' }],
    dedupeKey: 'ComplianceWatchdog:org:o1:PERSIST_AGENTNAME_TEST:2026-02-13T09:00:00.000Z',
  });

  assert.equal(created.agentName, 'ComplianceWatchdog');
  assert.equal(created.scopeType, 'ORG');
  assert.equal(created.scopeId, 'o1');
});

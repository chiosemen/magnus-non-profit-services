import test from 'node:test';
import assert from 'node:assert/strict';
import { DbAlertSink } from '../sinks/DbAlertSink';

test('DbAlertSink is idempotent on duplicate dedupeKey (P2002)', async () => {
  const fakeDb: any = {
    alert: {
      create: async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
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


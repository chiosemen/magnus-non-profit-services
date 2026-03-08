import test from 'node:test';
import assert from 'node:assert/strict';
import { FallbackAlertSink, createStructuredFailureLogger, type SinkFailure } from '../sinks/FallbackAlertSink';
import type { AlertSink } from '../sinks/AlertSink';
import type { AlertEvent } from '../contracts/events';

const testEvent: AlertEvent = {
  agentName: 'ComplianceWatchdog',
  scopeType: 'org',
  scopeId: 'org-123',
  severity: 'HIGH',
  type: 'FILING_OVERDUE',
  title: 'Form 990 Filing Overdue',
  body: 'The Form 990 filing deadline has passed.',
  recommendedActions: ['File immediately', 'Contact accountant'],
  dedupeKey: 'ComplianceWatchdog:org:org-123:FILING_OVERDUE:2026-03-08',
};

class MockSuccessSink implements AlertSink {
  calls: AlertEvent[] = [];
  async emit(event: AlertEvent): Promise<void> {
    this.calls.push(event);
  }
}

class MockFailingSink implements AlertSink {
  calls: AlertEvent[] = [];
  async emit(event: AlertEvent): Promise<void> {
    this.calls.push(event);
    throw new Error('Mock sink failure');
  }
}

test('FallbackAlertSink requires at least one sink', () => {
  assert.throws(
    () => new FallbackAlertSink([]),
    /FallbackAlertSink requires at least one sink/
  );
});

test('FallbackAlertSink uses first successful sink', async () => {
  const sink1 = new MockSuccessSink();
  const sink2 = new MockSuccessSink();

  const fallback = new FallbackAlertSink([
    { name: 'primary', sink: sink1 },
    { name: 'secondary', sink: sink2 },
  ]);

  await fallback.emit(testEvent);

  assert.equal(sink1.calls.length, 1, 'Primary sink should be called');
  assert.equal(sink2.calls.length, 0, 'Secondary sink should not be called');
});

test('FallbackAlertSink falls back on primary failure', async () => {
  const sink1 = new MockFailingSink();
  const sink2 = new MockSuccessSink();

  const fallback = new FallbackAlertSink([
    { name: 'primary', sink: sink1 },
    { name: 'secondary', sink: sink2 },
  ]);

  await fallback.emit(testEvent);

  assert.equal(sink1.calls.length, 1, 'Primary sink should be called');
  assert.equal(sink2.calls.length, 1, 'Secondary sink should be called after primary fails');
});

test('FallbackAlertSink throws when all sinks fail', async () => {
  const sink1 = new MockFailingSink();
  const sink2 = new MockFailingSink();

  const fallback = new FallbackAlertSink([
    { name: 'primary', sink: sink1 },
    { name: 'secondary', sink: sink2 },
  ]);

  await assert.rejects(
    () => fallback.emit(testEvent),
    /All alert sinks failed: primary, secondary/
  );
});

test('FallbackAlertSink calls onFailure handler on failures', async () => {
  const sink1 = new MockFailingSink();
  const sink2 = new MockSuccessSink();

  const failures: SinkFailure[] = [];
  const fallback = new FallbackAlertSink(
    [
      { name: 'primary', sink: sink1 },
      { name: 'secondary', sink: sink2 },
    ],
    {
      onFailure: (_event, f) => failures.push(...f),
    }
  );

  await fallback.emit(testEvent);

  assert.equal(failures.length, 1, 'Should report one failure');
  assert.equal(failures[0].sinkName, 'primary');
  assert.ok(failures[0].error.includes('Mock sink failure'));
});

test('emitWithResult returns success info', async () => {
  const sink1 = new MockFailingSink();
  const sink2 = new MockSuccessSink();

  const fallback = new FallbackAlertSink([
    { name: 'primary', sink: sink1 },
    { name: 'secondary', sink: sink2 },
  ]);

  const result = await fallback.emitWithResult(testEvent);

  assert.equal(result.success, true);
  assert.equal(result.usedSink, 'secondary');
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].sinkName, 'primary');
});

test('emitWithResult returns failure info when all fail', async () => {
  const sink1 = new MockFailingSink();
  const sink2 = new MockFailingSink();

  const fallback = new FallbackAlertSink([
    { name: 'primary', sink: sink1 },
    { name: 'secondary', sink: sink2 },
  ]);

  const result = await fallback.emitWithResult(testEvent);

  assert.equal(result.success, false);
  assert.equal(result.usedSink, '');
  assert.equal(result.failures.length, 2);
});

test('getSinkNames returns configured sink names', () => {
  const fallback = new FallbackAlertSink([
    { name: 'slack', sink: new MockSuccessSink() },
    { name: 'db', sink: new MockSuccessSink() },
    { name: 'console', sink: new MockSuccessSink() },
  ]);

  assert.deepEqual(fallback.getSinkNames(), ['slack', 'db', 'console']);
});

test('createStructuredFailureLogger produces valid JSON', () => {
  const logger = createStructuredFailureLogger();
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => logs.push(msg);

  try {
    logger(testEvent, [
      { sinkName: 'slack', error: 'Connection timeout', timestamp: '2026-03-08T12:00:00Z' },
    ]);

    assert.equal(logs.length, 1);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.level, 'error');
    assert.equal(parsed.message, 'Alert sink failures');
    assert.equal(parsed.alertType, 'FILING_OVERDUE');
    assert.equal(parsed.failures.length, 1);
    assert.equal(parsed.failures[0].sink, 'slack');
  } finally {
    console.error = originalError;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalMemoryEnvelopeV1 } from '../autonomousOps/operationalMemoryEnvelope';

test('operational memory envelope v1 is stable and requires summary', () => {
  const env = buildOperationalMemoryEnvelopeV1({
    asOf: new Date('2026-01-01T00:00:00Z'),
    summary: 'Scan completed.',
    data: { x: 1 },
  });
  assert.equal(env.schemaVersion, 1);
  assert.equal(env.asOf, '2026-01-01T00:00:00.000Z');
  assert.equal(env.summary, 'Scan completed.');
  assert.deepEqual(env.data, { x: 1 });
});

test('operational memory envelope v1 fails closed on blank summary', () => {
  assert.throws(
    () =>
      buildOperationalMemoryEnvelopeV1({
        asOf: new Date('2026-01-01T00:00:00Z'),
        summary: '   ',
        data: { x: 1 },
      }),
    /OP_MEMORY_SUMMARY_REQUIRED/,
  );
});


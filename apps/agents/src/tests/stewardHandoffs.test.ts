import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStewardOracleHandoffInput,
  STEWARD_ORACLE_HANDOFF_TITLE,
} from '../agents/complianceWatchdog/stewardHandoffs';
import type { AlertEvent } from '../contracts/events';

function baseAlert(overrides: Partial<AlertEvent>): AlertEvent {
  return {
    agentName: 'ComplianceWatchdog',
    scopeType: 'org',
    scopeId: '00000000-0000-0000-0000-000000000001',
    severity: 'MED',
    type: 'COMPLIANCE_DEADLINE_UPCOMING',
    title: 'Upcoming',
    body: 'Detail line one\nMore detail',
    recommendedActions: [],
    dedupeKey: 'k1',
    ...overrides,
  };
}

test('buildStewardOracleHandoffInput returns null when no HIGH alerts', () => {
  const input = buildStewardOracleHandoffInput([
    baseAlert({ severity: 'MED', type: 'X', title: 'Low priority' }),
  ]);
  assert.equal(input, null);
});

test('buildStewardOracleHandoffInput batches HIGH alerts for ORACLE with stable title', () => {
  const input = buildStewardOracleHandoffInput([
    baseAlert({
      severity: 'HIGH',
      type: 'COMPLIANCE_DEADLINE_OVERDUE',
      title: 'Compliance deadline overdue',
      dedupeKey: 'd1',
    }),
    baseAlert({
      severity: 'HIGH',
      type: 'FORM_990_THRESHOLD_CROSSED',
      title: 'Form 990 threshold crossed',
      dedupeKey: 'd2',
    }),
  ]);
  assert.ok(input);
  assert.equal(input!.fromAgentName, 'ComplianceWatchdog');
  assert.equal(input!.toAgentName, 'BoardIntelligenceOracle');
  assert.equal(input!.title, STEWARD_ORACLE_HANDOFF_TITLE);
  assert.equal(input!.urgency, 'high');
  assert.equal(input!.requiresHumanReview, true);
  assert.ok(input!.body.includes('COMPLIANCE_DEADLINE_OVERDUE'));
  assert.ok(input!.body.includes('FORM_990_THRESHOLD_CROSSED'));
  assert.ok(Array.isArray(input!.sourceEvidence));
  assert.equal((input!.sourceEvidence as unknown[]).length, 2);
  const evidence = input!.sourceEvidence as any[];
  assert.ok(evidence.every(e => e && e.type === 'steward_alert' && typeof e.alertType === 'string' && typeof e.dedupeKey === 'string'));
  assert.ok(evidence.every(e => typeof e.title === 'string' && e.title.length > 0));
});

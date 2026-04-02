import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWhatMattersNow } from '../whatMattersNow';
import type { ExecutiveBoard } from '../executiveBoard';

function boardFixture(): ExecutiveBoard {
  return {
    orgId: 'org_1',
    asOfIso: new Date('2026-04-01T00:00:00.000Z').toISOString(),
    evidenceIndex: [],
    disclaimers: [],
    activeObligations: [],
    financialSummary: {
      asOfIso: new Date('2026-04-01T00:00:00.000Z').toISOString(),
      sentinelActiveAlerts: [],
      grants: [],
      disclaimers: [],
    },
    moduleStates: [
      {
        module: 'org_context',
        state: 'INSUFFICIENT_DATA',
        severity: 'MED',
        summary: 'Missing org context kinds: ORG_IDENTITY',
        destination: { href: '/app/autonomous-ops/identity-files', status: 'UNIMPLEMENTED_IN_REPO' },
        evidenceRefs: [],
      },
      {
        module: 'autonomous_ops_settings',
        state: 'NOT_CONFIGURED',
        severity: 'MED',
        summary: 'Autonomous Ops settings are not configured.',
        destination: { href: '/app/autonomous-ops/settings', status: 'UNIMPLEMENTED_IN_REPO' },
        evidenceRefs: [],
      },
      {
        module: 'grants',
        state: 'OK',
        severity: null,
        summary: 'Grants recorded: 1.',
        destination: { href: '/app/grants', status: 'UNIMPLEMENTED_IN_REPO' },
        evidenceRefs: [],
      },
    ],
    topItems: [
      {
        kind: 'alert',
        severity: 'HIGH',
        createdAtIso: new Date('2026-04-01T00:10:00.000Z').toISOString(),
        title: 'Bank balance dropped',
        type: 'CASH_LOW',
        alertId: 'a1',
        destination: { href: '/app/autonomous-ops/alerts/a1', status: 'UNIMPLEMENTED_IN_REPO' },
        evidenceRefs: [],
      },
      {
        kind: 'handoff',
        severity: 'MED',
        createdAtIso: new Date('2026-04-01T00:05:00.000Z').toISOString(),
        title: 'Review Q2 filings',
        fromAgentName: 'COMPLIANCE_WATCHDOG',
        handoffId: 'h1',
        destination: { href: '/app/autonomous-ops/handoffs/h1', status: 'UNIMPLEMENTED_IN_REPO' },
        evidenceRefs: [],
      },
    ],
  };
}

test('deriveWhatMattersNow surfaces module attention first (deterministic order) then top items, capped', () => {
  const board = boardFixture();
  const out = deriveWhatMattersNow(board, 5);

  assert.equal(out.length, 4);

  // Module attention first: NOT_CONFIGURED outranks INSUFFICIENT_DATA.
  assert.equal(out[0]?.kind, 'module_attention');
  assert.equal(out[0]?.sourceModule, 'autonomous_ops_settings');
  assert.equal(out[0]?.category, 'missing_configuration_data');

  assert.equal(out[1]?.kind, 'module_attention');
  assert.equal(out[1]?.sourceModule, 'org_context');
  assert.equal(out[1]?.category, 'missing_configuration_data');

  // Then top items, preserving endpoint order; categories by kind.
  assert.equal(out[2]?.kind, 'top_item');
  assert.equal(out[2]?.sourceModule, 'alerts');
  assert.equal(out[2]?.category, 'true_current_risk');

  assert.equal(out[3]?.kind, 'top_item');
  assert.equal(out[3]?.sourceModule, 'handoffs');
  assert.equal(out[3]?.category, 'near_term_actionable');
});

test('deriveWhatMattersNow is bounded by maxItems', () => {
  const board = boardFixture();
  const out = deriveWhatMattersNow(board, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.kind, 'module_attention');
  assert.equal(out[1]?.kind, 'module_attention');
});


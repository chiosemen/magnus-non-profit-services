import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgContextValidationReport } from '@magnus/org-autonomous-ops-context';
import { runBoardIntelligenceOracleRules } from '../agents/boardIntelligenceOracle/rules';

const baseCtx = {
  agentName: 'BoardIntelligenceOracle' as const,
  scope: { type: 'org' as const, id: 'org-1' },
  window: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-15T12:00:00Z') },
};

test('ORACLE emits weekly summary and pre-board packet with compliance and grants', () => {
  const r = runBoardIntelligenceOracleRules({
    ctx: baseCtx,
    org: { id: 'org-1', name: 'Test Org', ein: '12-3456789' },
    complianceCalendar: [
      {
        id: 'c1',
        dueDate: new Date('2026-06-20T00:00:00Z'),
        status: 'PENDING',
        deadlineType: 'FORM_990',
      },
    ],
    grants: [
      {
        id: 'g1',
        funderName: 'Acme Foundation',
        endDate: new Date('2026-12-31T00:00:00Z'),
        totalAmount: 100_000,
        spentToDate: 40_000,
      },
    ],
    orgAlertsInWindow: [],
    openHandoffs: [],
    orgContextFiles: [],
  });
  assert.equal(r.alerts.length, 2);
  const types = r.alerts.map(a => a.type).sort();
  assert.deepEqual(types, ['BOARD_PRE_BOARD_BRIEFING', 'BOARD_WEEKLY_EXEC_SUMMARY']);
  const weekly = r.alerts.find(a => a.type === 'BOARD_WEEKLY_EXEC_SUMMARY');
  assert.ok(String(weekly?.body).includes('Test Org'));
  assert.ok(String(weekly?.body).includes('Count: 1'));
  assert.ok(String(weekly?.body).includes('`compliance_calendar`'));
  assert.ok(String(weekly?.body).includes('`grants`'));
  const pre = r.alerts.find(a => a.type === 'BOARD_PRE_BOARD_BRIEFING');
  assert.ok(String(pre?.body).includes('`c1`'));
  assert.ok(String(pre?.body).includes('`g1`'));
  assert.ok(String(pre?.body).includes('Acme Foundation'));
});

test('ORACLE prepends org-context gap alert when validation report has non-READY rows', () => {
  const r = runBoardIntelligenceOracleRules({
    ctx: baseCtx,
    org: { id: 'org-1', name: 'Test Org', ein: '12-3456789' },
    complianceCalendar: [],
    grants: [],
    orgAlertsInWindow: [],
    openHandoffs: [],
    orgContextFiles: [],
    orgContextValidationReport: {
      orgId: 'org-1',
      asOfIso: '2026-06-15T12:00:00.000Z',
      expectedKinds: ['ORG_IDENTITY'],
      rows: [
        {
          kind: 'ORG_IDENTITY',
          label: 'Org identity',
          purpose: 'p',
          whatBreaksIfMissing: 'w',
          requiredForPilot: 'required',
          status: 'PARTIAL',
          configuredState: 'template_unedited',
          blockers: ['missing_ntee_code'],
          warnings: [],
        },
      ],
      grantProfileMissingCodes: ['missing_ntee_code'],
      operatorActions: ['Edit ORG_IDENTITY'],
    } as OrgContextValidationReport,
  });
  assert.equal(r.alerts.length, 3);
  assert.equal(r.alerts[0]?.type, 'ORACLE_ORG_CONTEXT_INCOMPLETE');
});

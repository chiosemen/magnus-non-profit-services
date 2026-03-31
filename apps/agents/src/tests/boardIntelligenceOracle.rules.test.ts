import test from 'node:test';
import assert from 'node:assert/strict';
import { runBoardIntelligenceOracleRules } from '../agents/boardIntelligenceOracle/rules';

const baseCtx = {
  agentName: 'BoardIntelligenceOracle' as const,
  scope: { type: 'org' as const, id: 'org-1' },
  window: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-15T12:00:00Z') },
};

test('BOARD_PREP_DIGEST summarizes compliance and grants', () => {
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
  });
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0]?.type, 'BOARD_PREP_DIGEST');
  assert.ok(String(r.alerts[0]?.body).includes('Test Org'));
  assert.ok(String(r.alerts[0]?.body).includes('Acme Foundation'));
});

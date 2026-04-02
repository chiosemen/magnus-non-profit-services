import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActiveObligations } from '../activeObligations';

function fakeDb(params: {
  alerts: any[];
  handoffs: any[];
  compliance: any[];
}) {
  return {
    alert: {
      findMany: async () => params.alerts,
    },
    agentHandoff: {
      findMany: async () => params.handoffs,
    },
    complianceCalendar: {
      findMany: async () => params.compliance,
    },
  } as any;
}

test('buildActiveObligations includes only active ORACLE board-prep alerts and active handoffs + due-soon compliance', async () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const db = fakeDb({
    alerts: [
      {
        id: 'a1',
        agentName: 'BoardIntelligenceOracle',
        type: 'BOARD_WEEKLY_EXEC_SUMMARY',
        title: 'Weekly exec summary ready',
        severity: 'MED',
        status: 'OPEN',
        createdAt: new Date('2026-04-01T00:10:00.000Z'),
        relatedAgentRunId: null,
        relatedHandoffId: null,
      },
      {
        id: 'a2',
        agentName: 'FinancialSentinel',
        type: 'CASH_LOW',
        title: 'Cash low',
        severity: 'CRITICAL',
        status: 'OPEN',
        createdAt: new Date('2026-04-01T00:11:00.000Z'),
        relatedAgentRunId: null,
        relatedHandoffId: null,
      },
    ],
    handoffs: [
      {
        id: 'h1',
        title: 'Review Q2 filings',
        fromAgentName: 'COMPLIANCE_WATCHDOG',
        status: 'OPEN',
        createdAt: new Date('2026-04-01T00:05:00.000Z'),
        requiresHumanReview: true,
        relatedAgentRunId: 'run1',
      },
    ],
    compliance: [
      {
        id: 'c1',
        deadlineType: 'FORM_990',
        status: 'PENDING',
        dueDate: new Date('2026-04-05T00:00:00.000Z'),
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ],
  });

  const out = await buildActiveObligations({ db, orgId: 'org1', take: 50, now, dueSoonDays: 30 });

  // Included: ORACLE weekly exec summary (active), the handoff, the compliance item.
  // Excluded: FinancialSentinel alert (not in first slice), RESOLVED ORACLE briefing.
  const ids = out.map(o => `${o.kind}:${o.id}`);
  assert.ok(ids.includes('alert:a1'));
  assert.ok(ids.includes('handoff:h1'));
  assert.ok(ids.includes('compliance_calendar:c1'));
  assert.ok(!ids.includes('alert:a2'));

  const handoff = out.find(o => o.kind === 'handoff' && o.id === 'h1');
  assert.equal(handoff?.requiresHumanReview, true);
  assert.ok(handoff?.evidence.some(e => e.destination.href.includes('/api/org/autonomous-ops/handoffs/h1/audit')));
});


import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOracleBriefingPacket,
  formatWeeklyExecutiveSummary,
} from '../agents/boardIntelligenceOracle/oraclePacket';

const ctx = {
  agentName: 'BoardIntelligenceOracle' as const,
  scope: { type: 'org' as const, id: 'org-1' },
  window: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-15T12:00:00Z') },
};

test('buildOracleBriefingPacket includes sourceIndex entries for calendar, grants, financial and compliance alerts', () => {
  const packet = buildOracleBriefingPacket({
    ctx,
    org: { id: 'org-1', name: 'O', ein: '00-0000000' },
    complianceCalendar: [
      {
        id: 'cal-uuid-1',
        dueDate: new Date('2026-06-20T00:00:00Z'),
        status: 'PENDING',
        deadlineType: 'FORM_990',
      },
    ],
    grants: [
      {
        id: 'grant-uuid-1',
        funderName: 'F',
        endDate: new Date('2026-12-31T00:00:00Z'),
        totalAmount: 10,
        spentToDate: 1,
      },
    ],
    orgAlertsInWindow: [
      {
        id: 'alert-fin-1',
        type: 'GRANT_UNDERSPEND_PACE',
        severity: 'MED',
        title: 'Pace',
        createdAt: new Date('2026-06-10T00:00:00Z'),
      },
      {
        id: 'alert-comp-1',
        type: 'COMPLIANCE_DEADLINE_OVERDUE',
        severity: 'HIGH',
        title: 'Late',
        createdAt: new Date('2026-06-10T00:00:00Z'),
      },
    ],
    openHandoffs: [{ id: 'h1', title: 'T', fromAgentName: 'ComplianceWatchdog', createdAt: new Date() }],
    orgContextFiles: [{ id: 'f1', kind: 'ORG_HEARTBEAT', updatedAt: new Date() }],
  });

  const mods = packet.sourceIndex.map(s => `${s.module}:${s.ref}`);
  assert.ok(mods.some(x => x === 'compliance_calendar:cal-uuid-1'));
  assert.ok(mods.some(x => x === 'grants:grant-uuid-1'));
  assert.ok(mods.some(x => x === 'alerts_financial_watch:alert-fin-1'));
  assert.ok(mods.some(x => x === 'alerts_compliance_ops:alert-comp-1'));
  assert.ok(mods.some(x => x === 'agent_handoffs:h1'));
  assert.ok(mods.some(x => x === 'org_context:f1'));
});

test('formatWeeklyExecutiveSummary cites source modules in appendix', () => {
  const packet = buildOracleBriefingPacket({
    ctx,
    org: { id: 'org-1', name: 'O', ein: '00-0000000' },
    complianceCalendar: [],
    grants: [],
    orgAlertsInWindow: [],
    openHandoffs: [],
    orgContextFiles: [],
  });
  const md = formatWeeklyExecutiveSummary(packet);
  assert.ok(md.includes('Source index'));
  assert.ok(md.includes('No external communications'));
});

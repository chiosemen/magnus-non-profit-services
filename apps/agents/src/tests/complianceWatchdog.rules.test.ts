import { runComplianceWatchdogRules } from '../agents/complianceWatchdog/rules';
import test from 'node:test';
import assert from 'node:assert/strict';

function ctx() {
  return {
    agentName: 'ComplianceWatchdog' as const,
    scope: { type: 'org' as const, id: '00000000-0000-0000-0000-000000000001' },
    window: { start: new Date('2026-02-12T09:00:00.000Z'), end: new Date('2026-02-13T09:00:00.000Z') },
  };
}

test('threshold rule triggers when revenue >= 50k and uses990Postcard', () => {
  const res = runComplianceWatchdogRules({
    ctx: ctx(),
    org: {
      id: '00000000-0000-0000-0000-000000000001',
      ein: '123456789',
      name: 'Test Org',
      annualRevenue: 50000,
      subscriptionTier: 'STARTER',
      uses990Postcard: true,
      fiscalYearEnd: null,
    },
    complianceCalendar: [],
    grantReportDeadlines: [],
  });
  assert.equal(res.alerts.some(a => a.type === 'FORM_990_THRESHOLD_CROSSED'), true);
});

test('upcoming deadline rule triggers within 30 days', () => {
  const res = runComplianceWatchdogRules({
    ctx: ctx(),
    org: {
      id: '00000000-0000-0000-0000-000000000001',
      ein: '123456789',
      name: 'Test Org',
      annualRevenue: null,
      subscriptionTier: 'STARTER',
      uses990Postcard: false,
      fiscalYearEnd: null,
    },
    complianceCalendar: [
      {
        id: 'cal1',
        dueDate: new Date('2026-03-01T00:00:00.000Z'),
        status: 'PENDING',
        deadlineType: 'FORM_990',
      },
    ],
    grantReportDeadlines: [],
  });
  assert.equal(res.alerts.some(a => a.type === 'COMPLIANCE_DEADLINE_UPCOMING'), true);
});

test('overdue deadline rule triggers when dueDate < windowEnd', () => {
  const res = runComplianceWatchdogRules({
    ctx: ctx(),
    org: {
      id: '00000000-0000-0000-0000-000000000001',
      ein: '123456789',
      name: 'Test Org',
      annualRevenue: null,
      subscriptionTier: 'STARTER',
      uses990Postcard: false,
      fiscalYearEnd: null,
    },
    complianceCalendar: [
      {
        id: 'cal2',
        dueDate: new Date('2026-02-10T00:00:00.000Z'),
        status: 'IN_PROGRESS',
        deadlineType: 'STATE_REGISTRATION',
      },
    ],
    grantReportDeadlines: [],
  });
  assert.equal(res.alerts.some(a => a.type === 'COMPLIANCE_DEADLINE_OVERDUE'), true);
});

test('grant report overdue emits HIGH GRANT_REPORT_DEADLINE_OVERDUE', () => {
  const res = runComplianceWatchdogRules({
    ctx: ctx(),
    org: {
      id: '00000000-0000-0000-0000-000000000001',
      ein: '123456789',
      name: 'Test Org',
      annualRevenue: null,
      subscriptionTier: 'STARTER',
      uses990Postcard: false,
      fiscalYearEnd: null,
    },
    complianceCalendar: [],
    grantReportDeadlines: [
      {
        grantId: 'g1',
        dueDate: new Date('2026-02-01T00:00:00.000Z'),
        title: 'Q4 narrative',
      },
    ],
  });
  const hit = res.alerts.find(a => a.type === 'GRANT_REPORT_DEADLINE_OVERDUE');
  assert.ok(hit);
  assert.equal(hit!.severity, 'HIGH');
});

test('dedupeKey stable for same windowEnd', () => {
  const a = runComplianceWatchdogRules({
    ctx: ctx(),
    org: {
      id: '00000000-0000-0000-0000-000000000001',
      ein: '123456789',
      name: 'Test Org',
      annualRevenue: 60000,
      subscriptionTier: 'STARTER',
      uses990Postcard: true,
      fiscalYearEnd: null,
    },
    complianceCalendar: [],
    grantReportDeadlines: [],
  }).alerts.find(x => x.type === 'FORM_990_THRESHOLD_CROSSED')!;

  const b = runComplianceWatchdogRules({
    ctx: ctx(),
    org: {
      id: '00000000-0000-0000-0000-000000000001',
      ein: '123456789',
      name: 'Test Org',
      annualRevenue: 60000,
      subscriptionTier: 'STARTER',
      uses990Postcard: true,
      fiscalYearEnd: null,
    },
    complianceCalendar: [],
    grantReportDeadlines: [],
  }).alerts.find(x => x.type === 'FORM_990_THRESHOLD_CROSSED')!;

  assert.equal(a.dedupeKey, b.dedupeKey);
});

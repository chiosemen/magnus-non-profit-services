import type { ExecutiveAlert, ExecutiveSection } from './executiveRollupTypes';
import { EXECUTIVE_ALERTS_MAX } from './executiveRollupTypes';

function num(summary: Record<string, unknown>, key: string): number {
  const v = summary[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Deterministic alerts only: each rule reads fields already present on executive sections.
 * Sorted: high → medium → info, then stable by id. Capped at EXECUTIVE_ALERTS_MAX.
 */
export function buildDeterministicExecutiveAlerts(sections: Record<string, ExecutiveSection>): ExecutiveAlert[] {
  const raw: ExecutiveAlert[] = [];

  const ap = sections['auditPrep'];
  if (ap && ap.coverage !== 'unavailable') {
    const blocked = num(ap.summary, 'blockedCount');
    if (blocked > 0) {
      raw.push({
        id: 'audit_prep_blocked',
        severity: 'high',
        message: `${blocked} audit prep item(s) are BLOCKED — resolve in audit prep before relying on readiness views.`,
        sourceModule: 'auditPrep',
        dashboardHref: ap.dashboardHref,
        evidence: { kind: 'rollup_field', path: 'summary.blockedCount' },
        confidence: 'deterministic',
      });
    }
  }

  const cf = sections['cashFlow'];
  if (cf && cf.coverage !== 'unavailable') {
    if (cf.summary['status'] === 'insufficient_data') {
      const msg = typeof cf.summary['message'] === 'string' ? (cf.summary['message'] as string) : 'Cash flow forecast inputs are incomplete.';
      raw.push({
        id: 'cash_flow_insufficient',
        severity: 'medium',
        message: msg,
        sourceModule: 'cashFlow',
        dashboardHref: cf.dashboardHref,
        evidence: { kind: 'rollup_field', path: 'summary.status' },
        confidence: 'deterministic',
      });
    } else if (cf.summary['lowCashAlertTriggered'] === true) {
      raw.push({
        id: 'cash_flow_low_cash',
        severity: 'high',
        message: '13-week cash forecast shows projected cash below threshold in one or more weeks — review cash flow dashboard.',
        sourceModule: 'cashFlow',
        dashboardHref: cf.dashboardHref,
        evidence: { kind: 'rollup_field', path: 'summary.lowCashAlertTriggered' },
        confidence: 'deterministic',
      });
    }
  }

  const f9 = sections['form990Readiness'];
  if (f9 && f9.summary['status'] === 'insufficient_data') {
    raw.push({
      id: 'form990_insufficient',
      severity: 'medium',
      message: 'Form 990 / funder readiness data is insufficient — complete filing inputs in 990 readiness.',
      sourceModule: 'form990Readiness',
      dashboardHref: f9.dashboardHref,
      evidence: { kind: 'rollup_field', path: 'summary.status' },
      confidence: 'deterministic',
    });
  }

  const donor = sections['donorOperations'];
  if (donor && donor.summary['donorDataStatus'] === 'INSUFFICIENT_DATA') {
    raw.push({
      id: 'donor_insufficient',
      severity: 'medium',
      message: 'Donor operations data is INSUFFICIENT_DATA — aggregates are preliminary until thresholds are met.',
      sourceModule: 'donorOperations',
      dashboardHref: donor.dashboardHref,
      evidence: { kind: 'rollup_field', path: 'summary.donorDataStatus' },
      confidence: 'deterministic',
    });
  } else if (donor && donor.summary['donorDataStatus'] === 'NOT_CONFIGURED') {
    raw.push({
      id: 'donor_not_configured',
      severity: 'info',
      message: 'Donor operations not configured — no gifts ingested for donor rollup.',
      sourceModule: 'donorOperations',
      dashboardHref: donor.dashboardHref,
      evidence: { kind: 'rollup_field', path: 'summary.donorDataStatus' },
      confidence: 'deterministic',
    });
  }

  const vol = sections['volunteerOperations'];
  if (vol && vol.summary['volunteerDataStatus'] === 'INSUFFICIENT_DATA') {
    raw.push({
      id: 'volunteer_insufficient',
      severity: 'medium',
      message: 'Volunteer operations data is INSUFFICIENT_DATA — hours and in-kind views are preliminary.',
      sourceModule: 'volunteerOperations',
      dashboardHref: vol.dashboardHref,
      evidence: { kind: 'rollup_field', path: 'summary.volunteerDataStatus' },
      confidence: 'deterministic',
    });
  } else if (vol && vol.summary['volunteerDataStatus'] === 'NOT_CONFIGURED') {
    raw.push({
      id: 'volunteer_not_configured',
      severity: 'info',
      message: 'Volunteer operations not configured — no profiles or time entries.',
      sourceModule: 'volunteerOperations',
      dashboardHref: vol.dashboardHref,
      evidence: { kind: 'rollup_field', path: 'summary.volunteerDataStatus' },
      confidence: 'deterministic',
    });
  }

  const comp = sections['compliance'];
  if (comp && comp.coverage === 'weak' && num(comp.summary, 'upcomingDeadlines') === 0) {
    raw.push({
      id: 'compliance_no_deadlines',
      severity: 'info',
      message: 'No upcoming compliance calendar deadlines in range — add deadlines if the calendar should be active.',
      sourceModule: 'compliance',
      dashboardHref: comp.dashboardHref,
      evidence: { kind: 'rollup_field', path: 'summary.upcomingDeadlines' },
      confidence: 'deterministic',
    });
  }

  const order = { high: 0, medium: 1, info: 2 } as const;
  raw.sort((a, b) => {
    const d = order[a.severity] - order[b.severity];
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  return raw.slice(0, EXECUTIVE_ALERTS_MAX);
}

import { describe, expect, it } from 'vitest';
import { buildDeterministicExecutiveAlerts } from '../../apps/org-dashboard-api/src/executiveRollupAlerts';
import { computeModuleState, enrichSectionsWithModuleState } from '../../apps/org-dashboard-api/src/executiveRollupModuleState';
import type { ExecutiveSection, ExecutiveSectionInput } from '../../apps/org-dashboard-api/src/executiveRollupTypes';

function asEnriched(input: Record<string, ExecutiveSectionInput>): Record<string, ExecutiveSection> {
  return enrichSectionsWithModuleState(input);
}

describe('executiveRollupModuleState', () => {
  it('maps institutional portfolio to NOT_APPLICABLE_ORG_CONTEXT', () => {
    const sec: ExecutiveSectionInput = {
      coverage: 'unavailable',
      source: 'partner_portfolio',
      dashboardHref: '/dashboard/partner/portfolio',
      summary: {},
      unavailableReason: 'Partner only.',
    };
    expect(computeModuleState('institutionalPortfolio', sec)).toBe('NOT_APPLICABLE_ORG_CONTEXT');
  });

  it('maps donor NOT_CONFIGURED to NOT_CONFIGURED', () => {
    const sec: ExecutiveSectionInput = {
      coverage: 'unavailable',
      source: 'donor_operations',
      dashboardHref: '/d',
      summary: { donorDataStatus: 'NOT_CONFIGURED' },
    };
    expect(computeModuleState('donorOperations', sec)).toBe('NOT_CONFIGURED');
  });

  it('maps donor INSUFFICIENT_DATA weak to INSUFFICIENT_DATA', () => {
    const sec: ExecutiveSectionInput = {
      coverage: 'weak',
      source: 'donor_operations',
      dashboardHref: '/d',
      summary: { donorDataStatus: 'INSUFFICIENT_DATA' },
    };
    expect(computeModuleState('donorOperations', sec)).toBe('INSUFFICIENT_DATA');
  });

  it('maps subscription unavailable to UNAVAILABLE_FEATURE', () => {
    const sec: ExecutiveSectionInput = {
      coverage: 'unavailable',
      source: 'x',
      dashboardHref: '/x',
      summary: {},
      unavailableReason: 'Feature donor_operations is not enabled for this subscription.',
    };
    expect(computeModuleState('donorOperations', sec)).toBe('UNAVAILABLE_FEATURE');
  });
});

describe('buildDeterministicExecutiveAlerts', () => {
  it('emits high severity when audit prep has blocked items', () => {
    const sections = asEnriched({
      auditPrep: {
        coverage: 'weak',
        source: 'audit_prep',
        dashboardHref: '/dashboard/audit-prep',
        summary: { itemCount: 4, blockedCount: 1 },
      },
    });
    const alerts = buildDeterministicExecutiveAlerts(sections);
    expect(alerts.some(a => a.id === 'audit_prep_blocked' && a.severity === 'high')).toBe(true);
    expect(alerts[0]!.evidence.kind).toBe('rollup_field');
    expect(alerts[0]!.confidence).toBe('deterministic');
  });

  it('emits cash flow alert when inputs insufficient', () => {
    const sections = asEnriched({
      cashFlow: {
        coverage: 'weak',
        source: 'cash_flow_forecast',
        dashboardHref: '/dashboard/cash-flow',
        summary: { status: 'insufficient_data', message: 'Save assumptions first.' },
      },
    });
    const alerts = buildDeterministicExecutiveAlerts(sections);
    expect(alerts.find(a => a.id === 'cash_flow_insufficient')?.message).toContain('Save assumptions');
  });

  it('emits low-cash alert when flag set', () => {
    const sections = asEnriched({
      cashFlow: {
        coverage: 'weak',
        source: 'cash_flow_forecast',
        dashboardHref: '/dashboard/cash-flow',
        summary: { lowCashAlertTriggered: true, projectedEndingCash: 100 },
      },
    });
    const alerts = buildDeterministicExecutiveAlerts(sections);
    expect(alerts.some(a => a.id === 'cash_flow_low_cash')).toBe(true);
  });

  it('includes sourceModule and dashboardHref on each alert', () => {
    const sections = asEnriched({
      donorOperations: {
        coverage: 'weak',
        source: 'donor_operations',
        dashboardHref: '/dashboard/donor-operations',
        summary: { donorDataStatus: 'INSUFFICIENT_DATA' },
      },
    });
    const alerts = buildDeterministicExecutiveAlerts(sections);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.sourceModule).toBeTruthy();
      expect(a.dashboardHref.startsWith('/')).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { buildStateRegistrationRiskFlags, buildStateRegistrationSummary } from '../../apps/org-dashboard-api/src/orgStateRegistrationService';

describe('state registration risk flags', () => {
  it('flags missing registration, overdue renewal, and unknown status deterministically', () => {
    const asOf = new Date('2026-03-29T00:00:00.000Z');

    const missing = buildStateRegistrationRiskFlags({
      stateCode: 'CA',
      stateName: 'California',
      status: 'NOT_REGISTERED',
      solicitsDonations: true,
      renewalDueDate: null,
    }, asOf);

    const overdue = buildStateRegistrationRiskFlags({
      stateCode: 'NY',
      stateName: 'New York',
      status: 'ACTIVE',
      solicitsDonations: true,
      renewalDueDate: new Date('2026-02-01T00:00:00.000Z'),
    }, asOf);

    const unknown = buildStateRegistrationRiskFlags({
      stateCode: 'IL',
      stateName: 'Illinois',
      status: 'UNKNOWN',
      solicitsDonations: true,
      renewalDueDate: null,
    }, asOf);

    expect(missing.map(flag => flag.code)).toEqual(['MISSING_REGISTRATION']);
    expect(overdue.map(flag => flag.code)).toEqual(['OVERDUE_RENEWAL']);
    expect(unknown.map(flag => flag.code)).toEqual(['UNKNOWN_STATUS']);
  });

  it('summarizes system-generated risk counts across tracked states', () => {
    const summary = buildStateRegistrationSummary([
      {
        stateCode: 'CA',
        stateName: 'California',
        trackedStatus: 'not_registered',
        userEntered: {
          solicitsDonations: true,
          renewalDueDate: null,
          renewalNotes: null,
          updatedAt: '2026-03-29',
        },
        riskFlags: [{ code: 'MISSING_REGISTRATION', severity: 'high', message: 'x', generatedBy: 'system' }],
      },
      {
        stateCode: 'NY',
        stateName: 'New York',
        trackedStatus: 'active',
        userEntered: {
          solicitsDonations: true,
          renewalDueDate: '2026-02-01',
          renewalNotes: null,
          updatedAt: '2026-03-29',
        },
        riskFlags: [{ code: 'OVERDUE_RENEWAL', severity: 'high', message: 'x', generatedBy: 'system' }],
      },
      {
        stateCode: 'IL',
        stateName: 'Illinois',
        trackedStatus: 'unknown',
        userEntered: {
          solicitsDonations: true,
          renewalDueDate: null,
          renewalNotes: null,
          updatedAt: '2026-03-29',
        },
        riskFlags: [{ code: 'UNKNOWN_STATUS', severity: 'medium', message: 'x', generatedBy: 'system' }],
      },
    ]);

    expect(summary).toMatchObject({
      trackedStates: 3,
      solicitationStates: 3,
      activeStates: 1,
      pendingStates: 0,
      missingRegistrationStates: 1,
      overdueRenewals: 1,
      unknownStates: 1,
      highRiskStates: 2,
    });
  });

  it('does not generate risk flags when a state does not solicit donations', () => {
    const asOf = new Date('2026-03-29T00:00:00.000Z');
    const flags = buildStateRegistrationRiskFlags({
      stateCode: 'CA',
      stateName: 'California',
      status: 'NOT_REGISTERED',
      solicitsDonations: false,
      renewalDueDate: new Date('2026-01-01T00:00:00.000Z'),
    }, asOf);

    expect(flags).toEqual([]);
  });
});

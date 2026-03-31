import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mapAuditPrepToMobile,
  mapComplianceToMobile,
  mapGovernanceToMobile,
  mapOverviewToMobile,
  mapRestrictedFundsToMobile,
  MOBILE_READINESS_CAVEAT,
} from '@/lib/mobileOrgReadinessDto';

describe('mobileOrgReadinessDto mappers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps overview happy path', () => {
    const out = mapOverviewToMobile({
      organization: {
        id: 'org-1',
        ein: '12-3456789',
        name: 'Test Org',
        subscriptionTier: 'PRO',
        _count: { complianceCalendar: 3, grants: 2 },
      },
    });
    expect(out).toEqual({
      id: 'org-1',
      ein: '12-3456789',
      name: 'Test Org',
      subscriptionTier: 'PRO',
      complianceItemCount: 3,
      grantCount: 2,
    });
  });

  it('returns null for invalid overview payload', () => {
    expect(mapOverviewToMobile(null)).toBeNull();
    expect(mapOverviewToMobile({})).toBeNull();
    expect(mapOverviewToMobile({ organization: { id: 1 } })).toBeNull();
  });

  it('maps compliance calendar and next due (future only)', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const out = mapComplianceToMobile({
      orgId: 'x',
      complianceCalendar: [
        { dueDate: '2026-01-01T00:00:00.000Z' },
        { dueDate: '2026-12-01T00:00:00.000Z' },
      ],
    });
    expect(out?.itemCount).toBe(2);
    expect(out?.nextDueDate).toBe('2026-12-01');
  });

  it('maps compliance with no upcoming due dates', () => {
    const out = mapComplianceToMobile({
      orgId: 'x',
      complianceCalendar: [{ dueDate: '2020-01-01T00:00:00.000Z' }],
    });
    expect(out?.itemCount).toBe(1);
    expect(out?.nextDueDate).toBeNull();
  });

  it('maps governance snapshot', () => {
    const out = mapGovernanceToMobile({
      orgId: 'o',
      boardMembers: [{ id: '1' }, { id: '2' }],
      readiness: {
        complete: false,
        completionRate: 0.5,
        issueCount: 1,
        totalChecks: 10,
      },
    });
    expect(out).toEqual({
      boardMembersCount: 2,
      complete: false,
      completionRate: 0.5,
      issueCount: 1,
      totalChecks: 10,
    });
  });

  it('maps restricted funds aggregate', () => {
    const out = mapRestrictedFundsToMobile({
      orgId: 'o',
      restrictedFunds: [
        { id: 'a', totalRestrictedAmountUsd: 100 },
        { id: 'b', totalRestrictedAmountUsd: 50.5 },
      ],
    });
    expect(out).toEqual({ fundCount: 2, totalRestrictedAmountUsd: 150.5 });
  });

  it('maps audit prep summary', () => {
    const out = mapAuditPrepToMobile({
      orgId: 'o',
      disclaimer: 'Test disclaimer',
      summary: {
        overallStatus: 'in_progress',
        totalItems: 5,
        openItems: 2,
        blockedItems: 0,
        overdueItems: 1,
        explanation: [],
      },
      items: [],
    });
    expect(out).toEqual({
      overallStatus: 'in_progress',
      totalItems: 5,
      openItems: 2,
      blockedItems: 0,
      overdueItems: 1,
      disclaimer: 'Test disclaimer',
    });
  });

  it('exports caveat string', () => {
    expect(MOBILE_READINESS_CAVEAT.length).toBeGreaterThan(40);
    expect(MOBILE_READINESS_CAVEAT).toContain('read-only');
  });
});

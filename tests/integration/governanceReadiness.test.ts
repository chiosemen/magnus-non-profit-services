import { describe, expect, it } from 'vitest';
import { buildGovernanceReadinessSummary } from '../../apps/org-dashboard-api/src/orgGovernanceService';

describe('governance readiness summary', () => {
  it('flags missing and stale governance items deterministically', () => {
    const summary = buildGovernanceReadinessSummary([
      {
        id: 'member-1',
        orgId: 'org-1',
        name: 'Jamie Board',
        officerRole: 'CHAIR',
        termStart: new Date('2023-01-01T00:00:00.000Z'),
        termEnd: new Date('2024-12-31T00:00:00.000Z'),
        conflictDisclosureSignedAt: new Date('2024-03-01T00:00:00.000Z'),
        meetingsHeld: 6,
        meetingsAttended: 5,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
      {
        id: 'member-2',
        orgId: 'org-1',
        name: 'Taylor Director',
        officerRole: null,
        termStart: null,
        termEnd: null,
        conflictDisclosureSignedAt: null,
        meetingsHeld: null,
        meetingsAttended: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ], {
      id: 'profile-1',
      orgId: 'org-1',
      conflictOfInterestPolicy: true,
      whistleblowerPolicy: false,
      documentRetentionPolicy: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    }, new Date('2025-03-29T00:00:00.000Z'));

    expect(summary.complete).toBe(false);
    expect(summary.completionRate).toBe(45);
    expect(summary.missingItems).toBe(4);
    expect(summary.staleItems).toBe(2);
    expect(summary.issues.map(issue => issue.code)).toEqual([
      'POLICY_MISSING',
      'TERM_EXPIRED',
      'CONFLICT_DISCLOSURE_STALE',
      'TERM_MISSING',
      'CONFLICT_DISCLOSURE_MISSING',
      'ATTENDANCE_SUMMARY_MISSING',
    ]);
  });
});

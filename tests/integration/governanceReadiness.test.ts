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

  it('marks readiness complete when all tracked governance checks are satisfied', () => {
    const summary = buildGovernanceReadinessSummary([
      {
        id: 'member-1',
        orgId: 'org-1',
        name: 'Casey Chair',
        officerRole: 'CHAIR',
        termStart: new Date('2025-01-01T00:00:00.000Z'),
        termEnd: new Date('2027-12-31T00:00:00.000Z'),
        conflictDisclosureSignedAt: new Date('2026-02-01T00:00:00.000Z'),
        meetingsHeld: 6,
        meetingsAttended: 6,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ], {
      id: 'profile-1',
      orgId: 'org-1',
      conflictOfInterestPolicy: true,
      whistleblowerPolicy: true,
      documentRetentionPolicy: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }, new Date('2026-03-29T00:00:00.000Z'));

    expect(summary.complete).toBe(true);
    expect(summary.issueCount).toBe(0);
    expect(summary.missingItems).toBe(0);
    expect(summary.staleItems).toBe(0);
    expect(summary.completedChecks).toBe(8);
    expect(summary.totalChecks).toBe(8);
    expect(summary.completionRate).toBe(100);
    expect(summary.issues).toEqual([]);
  });
});

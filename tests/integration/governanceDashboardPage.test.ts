import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from '../../apps/web/node_modules/react-dom/server.node';

const mockCookiesGet = vi.fn();
const mockVerifyAccessToken = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: mockCookiesGet,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/tokens', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

describe('governance dashboard page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCookiesGet.mockReset();
    mockVerifyAccessToken.mockReset();
    mockRedirect.mockClear();
    mockCookiesGet.mockReturnValue({ name: 'session', value: 'test-token' });
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'user',
    });
  });

  it('renders governance dashboard sections from tracked governance snapshot data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      orgId: 'org-1',
      boardMembers: [
        {
          id: 'member-1',
          name: 'Alex Chair',
          officerRole: 'CHAIR',
          termStart: '2025-01-01',
          termEnd: '2099-12-31',
          conflictDisclosureSignedAt: '2020-01-01',
          attendanceSummary: {
            meetingsHeld: 6,
            meetingsAttended: 5,
            attendanceRate: 83.3,
          },
        },
        {
          id: 'member-2',
          name: 'Sam Director',
          officerRole: null,
          termStart: null,
          termEnd: null,
          conflictDisclosureSignedAt: null,
          attendanceSummary: {
            meetingsHeld: null,
            meetingsAttended: null,
            attendanceRate: null,
          },
        },
      ],
      policyChecklist: [
        {
          key: 'conflictOfInterestPolicy',
          title: 'Conflict of Interest Policy',
          enabled: true,
          form990Reference: 'Form 990 Part VI, Section B, line 12a',
        },
        {
          key: 'whistleblowerPolicy',
          title: 'Whistleblower Policy',
          enabled: false,
          form990Reference: 'Form 990 Part VI, Section B, line 13',
        },
        {
          key: 'documentRetentionPolicy',
          title: 'Document Retention Policy',
          enabled: true,
          form990Reference: 'Form 990 Part VI, Section B, line 14',
        },
      ],
      readiness: {
        complete: false,
        completionRate: 67,
        completedChecks: 8,
        totalChecks: 12,
        issueCount: 4,
        missingItems: 3,
        staleItems: 1,
        issues: [
          {
            code: 'POLICY_MISSING',
            severity: 'high',
            status: 'missing',
            message: 'Whistleblower Policy is not marked complete.',
            policyKey: 'whistleblowerPolicy',
            form990Reference: 'Form 990 Part VI, Section B, line 13',
          },
          {
            code: 'TERM_MISSING',
            severity: 'medium',
            status: 'missing',
            message: 'Sam Director is missing a complete board term start/end record.',
            memberId: 'member-2',
            memberName: 'Sam Director',
            form990Reference: 'Form 990 Part VI, Section A current board leadership support',
          },
          {
            code: 'CONFLICT_DISCLOSURE_STALE',
            severity: 'high',
            status: 'stale',
            message: 'Alex Chair has no current-year conflict disclosure on file.',
            memberId: 'member-1',
            memberName: 'Alex Chair',
            form990Reference: 'Form 990 Part VI, Section B, line 12 conflict-of-interest monitoring',
          },
          {
            code: 'ATTENDANCE_SUMMARY_MISSING',
            severity: 'medium',
            status: 'missing',
            message: 'Sam Director is missing an annual meeting attendance summary.',
            memberId: 'member-2',
            memberName: 'Sam Director',
            form990Reference: 'Board oversight records supporting Form 990 governance disclosures',
          },
        ],
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: GovernanceDashboardPage } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/governance/page'
    );
    const element = await GovernanceDashboardPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Governance dashboard');
    expect(html).toContain('Overall governance readiness');
    expect(html).toContain('Completion:</b> 67%');
    expect(html).toContain('Checks:</b> 8 / 12');
    expect(html).toContain('Board roster summary');
    expect(html).toContain('Board members:</b> 2');
    expect(html).toContain('Officer role summary');
    expect(html).toContain('Chair: 1');
    expect(html).toContain('Term expiration visibility');
    expect(html).toContain('Missing term dates:</b> 1');
    expect(html).toContain('Conflict-of-interest disclosures (annual)');
    expect(html).toContain('Meeting attendance summary');
    expect(html).toContain('Policy checklist status');
    expect(html).toContain('Conflict of Interest Policy: complete');
    expect(html).toContain('Whistleblower Policy: missing');
    expect(html).toContain('Document Retention Policy: complete');
    expect(html).toContain('Board roster details');
    expect(html).toContain('Alex Chair');
    expect(html).toContain('Sam Director');
    expect(html).toContain('Missing and stale governance items');
    expect(html).toContain('[missing] Whistleblower Policy is not marked complete.');
    expect(html).toContain('[stale] Alex Chair has no current-year conflict disclosure on file.');
  });
});

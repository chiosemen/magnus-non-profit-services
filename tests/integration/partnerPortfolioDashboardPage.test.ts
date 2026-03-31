import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  headers: () => ({
    get: (name: string) => {
      if (name === 'host') return 'localhost:3000';
      if (name === 'x-forwarded-proto') return 'http';
      return null;
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/tokens', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

function emptyStateSummary(overrides: Partial<{
  overdueRenewals: number;
  highRiskStates: number;
  missingRegistrationStates: number;
}> = {}) {
  return {
    trackedStates: 1,
    solicitationStates: 1,
    activeStates: 1,
    pendingStates: 0,
    missingRegistrationStates: 0,
    overdueRenewals: 0,
    unknownStates: 0,
    highRiskStates: 0,
    ...overrides,
  };
}

function makeRow(
  over: Partial<{
    membershipId: string;
    name: string;
    governanceComplete: boolean;
    auditStatus: string;
    overdueRenewals: number;
    blockedItems: number;
    overdueItems: number;
    programLabel: string | null;
    programId: string | null;
    cohortLabel: string | null;
  }>
) {
  const membershipId = over.membershipId ?? '00000000-0000-4000-8000-000000000001';
  return {
    membershipId,
    orgId: '00000000-0000-4000-8000-000000000002',
    name: over.name ?? 'Org',
    ein: '123456789',
    subscriptionTier: 'ENTERPRISE',
    subscriptionStatus: 'ACTIVE',
    programId: over.programId ?? null,
    programLabel: over.programLabel ?? null,
    cohortLabel: over.cohortLabel ?? null,
    isActive: true,
    partnerNotes: null,
    partnerTags: [] as string[],
    governance: {
      complete: over.governanceComplete ?? true,
      issueCount: over.governanceComplete === false ? 2 : 0,
      completionRate: over.governanceComplete === false ? 40 : 100,
    },
    stateRegistrations: {
      summary: emptyStateSummary({
        overdueRenewals: over.overdueRenewals ?? 0,
        highRiskStates: 0,
        missingRegistrationStates: 0,
      }),
    },
    auditPrep: {
      overallStatus: over.auditStatus ?? 'all_complete',
      openItems: 0,
      blockedItems: over.blockedItems ?? 0,
      overdueItems: over.overdueItems ?? 0,
      totalItems: 5,
    },
  };
}

describe('partner portfolio dashboard page', () => {
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
      partnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      partnerRole: 'PARTNER_ADMIN',
    });
  });

  it('renders non-partner message when JWT lacks partner context', async () => {
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'user',
    });

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/partner/portfolio/page'
    );
    const element = await Page({ searchParams: {} });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('not linked to an institutional partner');
  });

  it('renders rollups, high-risk list, disclaimer, CSV link, and filter strip from API contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      partnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      disclaimer: 'Portfolio data is aggregated from each organization',
      resultCount: 3,
      filtersApplied: {},
      organizations: [
        makeRow({
          membershipId: 'm1',
          name: 'Alpha Community',
          governanceComplete: true,
          programLabel: 'Cohort A',
          programId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          cohortLabel: '2026',
        }),
        makeRow({
          membershipId: 'm2',
          name: 'Beta Services',
          governanceComplete: false,
          auditStatus: 'overdue',
          overdueItems: 2,
          programLabel: 'Cohort A',
          programId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          cohortLabel: '2026',
        }),
        makeRow({
          membershipId: 'm3',
          name: 'Gamma House',
          governanceComplete: true,
          overdueRenewals: 1,
          programLabel: null,
          programId: null,
          cohortLabel: null,
        }),
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/partner/portfolio/page'
    );
    const element = await Page({ searchParams: { governanceComplete: 'false' } });
    const html = renderToStaticMarkup(element);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/partner\/portfolio\/summary\?governanceComplete=false/),
      expect.any(Object)
    );

    expect(html).toContain('3 organizations in this view');
    expect(html).toContain('Portfolio data is aggregated');
    expect(html).toContain('How this view is built');
    expect(html).toContain('Readiness');
    expect(html).toContain('Governance readiness');
    expect(html).toContain('Audit prep status');
    expect(html).toContain('Subscription status');
    expect(html).toContain('Billing/subscription state');
    expect(html).toContain('By program');
    expect(html).toContain('Cohort label');
    expect(html).toContain('High-risk');
    expect(html).toContain('Beta Services');
    expect(html).toContain('Gamma House');
    expect(html).toContain('Portfolio table');
    expect(html).toContain('/api/partner/portfolio/export?governanceComplete=false');
    expect(html).toContain('Quick filters');
    expect(html).toContain('governanceComplete=false');
    expect(html).toContain('Include inactive (admin)');
  });

  it('PARTNER_VIEWER does not show include inactive filter link', async () => {
    mockVerifyAccessToken.mockReturnValue({
      userId: 'user-1',
      orgId: 'org-1',
      role: 'user',
      partnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      partnerRole: 'PARTNER_VIEWER',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      partnerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      disclaimer: 'D',
      resultCount: 1,
      filtersApplied: {},
      organizations: [makeRow({ name: 'Only Org' })],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/partner/portfolio/page'
    );
    const html = renderToStaticMarkup(await Page({ searchParams: {} }));

    expect(html).not.toContain('Include inactive (admin)');
    expect(html).toContain('PARTNER_VIEWER');
  });
});

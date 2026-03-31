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
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/tokens', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

describe('restricted funds dashboard page', () => {
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

  it('renders restricted-fund dashboard metrics and deterministic risk displays', async () => {
    const listPayload = {
      orgId: 'org-1',
      restrictedFunds: [
        {
          id: 'fund-1',
          name: 'Education Grant',
          sourceName: 'Donor A',
          totalRestrictedAmountUsd: 10000,
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-06-30T00:00:00.000Z',
        },
        {
          id: 'fund-2',
          name: 'Food Program',
          sourceName: 'Donor B',
          totalRestrictedAmountUsd: 8000,
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-05-15T00:00:00.000Z',
        },
      ],
    };

    const summaryFund1 = {
      fund: {
        id: 'fund-1',
        name: 'Education Grant',
        sourceName: 'Donor A',
        totalRestrictedAmountUsd: 10000,
        restrictionPurpose: 'Program delivery',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      },
      computed: {
        remainingBalanceUsd: 4000,
        totalUsedUsd: 6000,
        period: {
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-06-30T00:00:00.000Z',
          daysRemaining: 40,
        },
        spendRates: {
          requiredPerDayUsdToFullyUseByEnd: 100,
          projectedTotalUsedByEndUsd: 8500,
        },
        riskFlags: ['UNDERSPEND_RISK'],
        explainability: [
          'Remaining balance = total restricted - total used = $4000.00',
          'Projected total used by end = used so far + (used/day * days remaining) = $8500.00',
        ],
      },
      caveat: 'This is restricted-fund tracking based on entered usage events; it is not a general ledger or GAAP-complete fund accounting.',
    };

    const summaryFund2 = {
      fund: {
        id: 'fund-2',
        name: 'Food Program',
        sourceName: 'Donor B',
        totalRestrictedAmountUsd: 8000,
        restrictionPurpose: 'Nutrition support',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-05-15T00:00:00.000Z',
      },
      computed: {
        remainingBalanceUsd: -200,
        totalUsedUsd: 8200,
        period: {
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-05-15T00:00:00.000Z',
          daysRemaining: 5,
        },
        spendRates: {
          requiredPerDayUsdToFullyUseByEnd: 0,
          projectedTotalUsedByEndUsd: 9000,
        },
        riskFlags: ['OVERSPENT'],
        explainability: [
          'Remaining balance = total restricted - total used = $-200.00',
        ],
      },
      caveat: 'This is restricted-fund tracking based on entered usage events; it is not a general ledger or GAAP-complete fund accounting.',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/org/restricted-funds/') && url.endsWith('/fund-1')) {
        return new Response(JSON.stringify(summaryFund1), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/org/restricted-funds/') && url.endsWith('/fund-2')) {
        return new Response(JSON.stringify(summaryFund2), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(listPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { default: RestrictedFundsDashboardPage } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/restricted-funds/page'
    );
    const element = await RestrictedFundsDashboardPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Restricted funds dashboard');
    expect(html).toContain('Total active restricted funds:</b> 2');
    expect(html).toContain('Total restricted balance remaining:</b> $3,800.00');
    expect(html).toContain('Over-spend risk funds:</b> 1');
    expect(html).toContain('Under-spend / pace risk funds:</b> 1');
    expect(html).toContain('Upcoming period-end deadlines');
    expect(html).toContain('Food Program - 2026-05-15');
    expect(html).toContain('Fund-by-fund status table');
    expect(html).toContain('Education Grant');
    expect(html).toContain('Food Program');
    expect(html).toContain('Underspend Risk');
    expect(html).toContain('Overspent');
    expect(html).toContain('Calculation basis');
    expect(html).toContain('restricted-fund tracking based on entered usage events');
  });
});

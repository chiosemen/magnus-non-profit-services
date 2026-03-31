import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from '../../apps/web/node_modules/react-dom/server.node';
import { CASH_FLOW_FORECAST_CAVEAT } from '@magnus/financial';

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

describe('cash flow dashboard page', () => {
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

  it('renders insufficient_data without forecast numbers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'insufficient_data',
      message: 'No assumptions saved.',
      requiredFields: ['current_cash_balance'],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/cash-flow/page'
    );
    const element = await Page();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Cash flow forecast');
    expect(html).toContain('No assumptions saved.');
    expect(html).toContain('current_cash_balance');
    expect(html).not.toContain('Projected ending cash');
  });

  it('renders panels, alert state, trend table, assumptions, and caveat from API contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'ready',
      orgId: 'org-1',
      name: 'Test Org',
      caveat: CASH_FLOW_FORECAST_CAVEAT,
      methodology: 'Deterministic 13-week cash flow forecast using manual weekly inflow entries',
      horizonWeeks: 13,
      currentCashBalance: 100_000,
      projectedEndingCash: 80_000,
      thresholdUsd: 20_000,
      thresholdSource: 'reserve_target',
      lowCashAlert: {
        triggered: false,
        weeksBelowThreshold: [],
        explanation: 'No low-cash alert.',
      },
      highestRiskWeeks: [
        {
          weekNumber: 5,
          endingCash: 82_000,
          belowThreshold: false,
          explanation: 'Week 5 ends at $82,000 after modeled flows.',
        },
      ],
      summary: {
        totalInflows: 50_000,
        totalOutflows: 70_000,
        netOverHorizon: -20_000,
        lowestProjectedCash: 80_000,
        lowestCashWeek: 13,
      },
      assumptions: {
        current_cash_balance: 100_000,
        expected_grant_inflows: [{ week: 3, amount: 50_000, label: 'Grant A' }],
        expected_donation_inflows: [],
        payroll_schedule: { cadence: 'biweekly', amount: 10_000, first_payment_week: 1 },
        recurring_operating_expenses: [{ name: 'Rent', amount: 2_000, cadence: 'monthly', first_due_week: 1 }],
        reserve_threshold_target: 20_000,
      },
      weeklyEndingCashTrend: Array.from({ length: 13 }, (_, i) => ({
        weekNumber: i + 1,
        endingCash: 100_000 - i * 1_000,
        belowThreshold: false,
      })),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/cash-flow/page'
    );
    const element = await Page();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Current cash position');
    expect(html).toContain('Projected ending cash');
    expect(html).toContain('Reserve threshold');
    expect(html).toContain('No low-cash alert.');
    expect(html).toContain('Key inflows');
    expect(html).toContain('Highest-risk weeks');
    expect(html).toContain('Week 5');
    expect(html).toContain('13-week ending cash trend');
    expect(html).toContain('Assumptions');
    expect(html).toContain('Grant A');
    expect(html).toContain(CASH_FLOW_FORECAST_CAVEAT);
    expect(html).toContain('Deterministic 13-week cash flow forecast');
  });

  it('shows warning styling copy when lowCashAlert.triggered', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'ready',
      orgId: 'org-1',
      name: 'Test Org',
      caveat: CASH_FLOW_FORECAST_CAVEAT,
      methodology: 'Deterministic 13-week',
      horizonWeeks: 13,
      currentCashBalance: 10_000,
      projectedEndingCash: 5_000,
      thresholdUsd: 15_000,
      thresholdSource: 'reserve_target',
      lowCashAlert: {
        triggered: true,
        weeksBelowThreshold: [2, 3],
        explanation: 'Low-cash alert triggered in weeks 2, 3.',
      },
      highestRiskWeeks: [],
      summary: {
        totalInflows: 0,
        totalOutflows: 5_000,
        netOverHorizon: -5_000,
        lowestProjectedCash: 5_000,
        lowestCashWeek: 13,
      },
      assumptions: {
        current_cash_balance: 10_000,
        expected_grant_inflows: [],
        expected_donation_inflows: [],
        payroll_schedule: { cadence: 'weekly', amount: 1_000, first_payment_week: 1 },
        recurring_operating_expenses: [],
      },
      weeklyEndingCashTrend: [{ weekNumber: 1, endingCash: 9_000, belowThreshold: true }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const { default: Page } = await import(
      '../../apps/web/src/app/(dashboard)/dashboard/cash-flow/page'
    );
    const element = await Page();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Warning:');
    expect(html).toContain('Low-cash alert triggered');
  });
});

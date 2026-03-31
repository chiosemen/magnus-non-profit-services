import { describe, expect, it } from 'vitest';
import { CashFlowForecastService, RequiredFieldError } from '@magnus/financial';
import getCashFlowForecast from '../../apps/mcp-connector/src/tools/financials/get-cash-flow-forecast';

const baseInput = {
  currentCashBalance: 120_000,
  expectedGrantInflows: [
    { week: 2, amount: 30_000, label: 'County reimbursement' },
    { week: 8, amount: 20_000, label: 'Foundation installment' },
  ],
  expectedDonationInflows: [
    { week: 1, amount: 10_000, label: 'Spring appeal' },
    { week: 5, amount: 5_000, label: 'Board gifts' },
    { week: 9, amount: 5_000, label: 'Monthly donor push' },
  ],
  payrollSchedule: {
    cadence: 'biweekly' as const,
    amount: 18_000,
    firstPaymentWeek: 1,
  },
  recurringOperatingExpenses: [
    { name: 'Rent', amount: 4_000, cadence: 'monthly' as const, firstDueWeek: 1 },
    { name: 'Software', amount: 1_000, cadence: 'weekly' as const, firstDueWeek: 1 },
  ],
};

describe('CashFlowForecastService', () => {
  it('builds a deterministic 13-week forecast for the normal path', () => {
    const service = new CashFlowForecastService();

    const result = service.forecast({
      ...baseInput,
      reserveThresholdTarget: 25_000,
    });

    expect(result.calculated.projectedEndingCash).toBe(35_000);
    expect(result.calculated.totalInflows).toBe(70_000);
    expect(result.calculated.totalOutflows).toBe(155_000);
    expect(result.calculated.lowestProjectedCash).toBe(35_000);
    expect(result.calculated.lowestCashWeek).toBe(13);
    expect(result.calculated.lowCashAlert.triggered).toBe(false);
    expect(result.calculated.lowCashAlert.weeksBelowThreshold).toEqual([]);
    expect(result.calculated.weeks).toHaveLength(13);
    expect(result.calculated.weeks[0]).toMatchObject({
      weekNumber: 1,
      startingCash: 120_000,
      endingCash: 107_000,
    });
    expect(result.calculated.weeks[12]).toMatchObject({
      weekNumber: 13,
      endingCash: 35_000,
    });
  });

  it('raises a low-cash alert when projected cash falls below the threshold', () => {
    const service = new CashFlowForecastService();

    const result = service.forecast({
      ...baseInput,
      reserveThresholdTarget: 40_000,
    });

    expect(result.calculated.lowCashAlert.triggered).toBe(true);
    expect(result.calculated.lowCashAlert.weeksBelowThreshold).toEqual([13]);
    expect(result.calculated.highestRiskWeeks[0]).toMatchObject({
      weekNumber: 13,
      endingCash: 35_000,
      belowThreshold: true,
    });
    expect(result.calculated.highestRiskWeeks[0]?.explanation).toContain('Week 13 ends at $35,000');
    expect(result.calculated.lowCashAlert.explanation).toContain('below the $40,000 threshold');
  });

  it('fails closed when required forecast inputs are missing', () => {
    const service = new CashFlowForecastService();

    expect(() => service.forecast({
      expectedGrantInflows: [],
      expectedDonationInflows: [],
      payrollSchedule: {
        cadence: 'weekly',
        amount: 5_000,
        firstPaymentWeek: 1,
      },
      recurringOperatingExpenses: [],
    })).toThrowError(RequiredFieldError);

    expect(() => service.forecast({
      currentCashBalance: 50_000,
      expectedGrantInflows: [],
      expectedDonationInflows: [],
      payrollSchedule: {
        cadence: 'weekly',
        amount: 5_000,
        firstPaymentWeek: 1,
      },
    })).toThrow('recurring_operating_expenses');
  });
});

describe('get-cash-flow-forecast tool', () => {
  it('returns separated user input and calculated output contracts', async () => {
    const payload = await getCashFlowForecast.execute({
      organization_name: 'North Star Youth Center',
      current_cash_balance: 120_000,
      expected_grant_inflows: [
        { week: 2, amount: 30_000, label: 'County reimbursement' },
        { week: 8, amount: 20_000, label: 'Foundation installment' },
      ],
      expected_donation_inflows: [
        { week: 1, amount: 10_000, label: 'Spring appeal' },
        { week: 5, amount: 5_000, label: 'Board gifts' },
        { week: 9, amount: 5_000, label: 'Monthly donor push' },
      ],
      payroll_schedule: {
        cadence: 'biweekly',
        amount: 18_000,
        first_payment_week: 1,
      },
      recurring_operating_expenses: [
        { name: 'Rent', amount: 4_000, cadence: 'monthly', first_due_week: 1 },
        { name: 'Software', amount: 1_000, cadence: 'weekly', first_due_week: 1 },
      ],
      reserve_threshold_target: 25_000,
    });

    const parsed = JSON.parse(payload);

    expect(parsed).toMatchObject({
      organization_name: 'North Star Youth Center',
      forecast_horizon_weeks: 13,
      user_input: {
        current_cash_balance: {
          amount_raw: 120_000,
        },
        payroll_schedule: {
          cadence: 'biweekly',
          amount_raw: 18_000,
          first_payment_week: 1,
        },
      },
      calculated_output: {
        projected_ending_cash_raw: 35_000,
        lowest_cash_week: 13,
        low_cash_alert: {
          triggered: false,
          threshold_raw: 25_000,
          weeks_below_threshold: [],
        },
      },
    });
    expect(parsed.calculated_output.highest_risk_weeks[0]).toMatchObject({
      week: 13,
      projected_ending_cash_raw: 35_000,
      below_threshold: false,
    });
  });
});

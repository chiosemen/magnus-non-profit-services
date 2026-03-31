import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@magnus/db/client', () => ({
  default: {
    organization: {
      findUnique,
      update,
    },
  },
}));

import { getOrgCashFlowForecast, putOrgCashFlowForecastInputs } from '../../apps/org-dashboard-api/src/orgCashFlowForecastService';
import { CASH_FLOW_FORECAST_CAVEAT } from '@magnus/financial';

const storedFixture = {
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
    cadence: 'biweekly' as const,
    amount: 18_000,
    first_payment_week: 1,
  },
  recurring_operating_expenses: [
    { name: 'Rent', amount: 4_000, cadence: 'monthly' as const, first_due_week: 1 },
    { name: 'Software', amount: 1_000, cadence: 'weekly' as const, first_due_week: 1 },
  ],
  reserve_threshold_target: 25_000,
};

describe('orgCashFlowForecastService', () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it('returns null when organization is missing', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getOrgCashFlowForecast('missing')).resolves.toBeNull();
  });

  it('returns insufficient_data when no inputs stored', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Test Org',
      cashFlowForecastInputs: null,
    });
    const dto = await getOrgCashFlowForecast('org-1');
    expect(dto).toMatchObject({ status: 'insufficient_data' });
    if (dto?.status === 'insufficient_data') {
      expect(dto.message).toContain('No cash flow assumptions');
    }
  });

  it('returns insufficient_data when stored JSON fails validation', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Test Org',
      cashFlowForecastInputs: { current_cash_balance: 'x' },
    });
    const dto = await getOrgCashFlowForecast('org-1');
    expect(dto).toMatchObject({ status: 'insufficient_data' });
  });

  it('returns ready DTO aligned with deterministic CashFlowForecastService', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'North Star Youth Center',
      cashFlowForecastInputs: storedFixture,
    });
    const dto = await getOrgCashFlowForecast('org-1');
    expect(dto).not.toBeNull();
    if (!dto || dto.status !== 'ready') throw new Error('expected ready');

    expect(dto.caveat).toBe(CASH_FLOW_FORECAST_CAVEAT);
    expect(dto.projectedEndingCash).toBe(35_000);
    expect(dto.currentCashBalance).toBe(120_000);
    expect(dto.lowCashAlert.triggered).toBe(false);
    expect(dto.summary.totalInflows).toBe(70_000);
    expect(dto.summary.totalOutflows).toBe(155_000);
    expect(dto.highestRiskWeeks[0]).toMatchObject({
      weekNumber: 13,
      endingCash: 35_000,
      belowThreshold: false,
    });
    expect(dto.weeklyEndingCashTrend).toHaveLength(13);
    expect(dto.weeklyEndingCashTrend[12]).toMatchObject({
      weekNumber: 13,
      endingCash: 35_000,
    });
  });

  it('surfaces low-cash alert when threshold triggers', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'North Star Youth Center',
      cashFlowForecastInputs: { ...storedFixture, reserve_threshold_target: 40_000 },
    });
    const dto = await getOrgCashFlowForecast('org-1');
    if (!dto || dto.status !== 'ready') throw new Error('expected ready');
    expect(dto.lowCashAlert.triggered).toBe(true);
    expect(dto.lowCashAlert.weeksBelowThreshold).toEqual([13]);
    expect(dto.highestRiskWeeks[0]?.belowThreshold).toBe(true);
    expect(dto.lowCashAlert.explanation).toContain('$40,000');
  });

  it('persists inputs via putOrgCashFlowForecastInputs', async () => {
    update.mockResolvedValue({});
    await putOrgCashFlowForecastInputs('org-1', storedFixture);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { cashFlowForecastInputs: storedFixture },
    });
  });
});

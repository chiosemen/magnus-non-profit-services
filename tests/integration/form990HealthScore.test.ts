import { describe, expect, it } from 'vitest';
import { Form990HealthScoreService, RequiredFieldError } from '@magnus/reports';
import get990HealthScore from '../../apps/mcp-connector/src/tools/financials/get-990-health-score';

describe('Form990HealthScoreService', () => {
  it('scores a structured 990 filing deterministically', () => {
    const service = new Form990HealthScoreService();

    const result = service.score({
      taxYear: 2024,
      filing: {
        totalRevenue: 1_500_000,
        totalExpenses: 1_200_000,
        programServiceExpenses: 900_000,
        netAssetsWithoutDonorRestrictions: 600_000,
        executiveDirectorCompensation: 90_000,
        revenueStreams: [
          { name: 'Government Grants', amount: 450_000 },
          { name: 'Individual Donations', amount: 450_000 },
          { name: 'Program Service Revenue', amount: 300_000 },
          { name: 'Corporate Support', amount: 300_000 },
        ],
      },
    });

    expect(result.score).toBe(80);
    expect(result.metrics.programExpenseRatio).toBe(0.75);
    expect(result.metrics.topRevenueShare).toBe(0.3);
    expect(result.metrics.reserveMonths).toBe(6);
    expect(result.metrics.executiveCompensationRatio).toBe(0.075);
    expect(result.components.programExpenseRatio.score).toBe(71);
    expect(result.components.revenueConcentrationRisk.score).toBe(82);
    expect(result.components.reserveMonths.score).toBe(100);
    expect(result.components.executiveCompensationRatio.score).toBe(63);
    expect(result.explanation).toContain('80/100');
  });

  it('fails closed when required source fields are missing', () => {
    const service = new Form990HealthScoreService();

    expect(() => service.score({
      taxYear: 2024,
      filing: {
        totalRevenue: 500_000,
        totalExpenses: 450_000,
        netAssetsWithoutDonorRestrictions: 100_000,
        executiveDirectorCompensation: 50_000,
        revenueStreams: [{ name: 'Contributions', amount: 500_000 }],
      },
    })).toThrowError(RequiredFieldError);

    expect(() => service.score({
      taxYear: 2024,
      filing: {
        totalRevenue: 500_000,
        totalExpenses: 450_000,
        programServiceExpenses: 300_000,
        netAssetsWithoutDonorRestrictions: 100_000,
        executiveDirectorCompensation: 50_000,
        revenueStreams: [{ amount: 500_000 }],
      },
    })).toThrow('filing.revenue_streams[0].name');
  });
});

describe('get-990-health-score tool', () => {
  it('returns the API-facing score contract', async () => {
    const payload = await get990HealthScore.execute({
      ein: '123456789',
      tax_year: 2024,
      filing: {
        total_revenue: 1_500_000,
        total_expenses: 1_200_000,
        program_service_expenses: 900_000,
        net_assets_without_donor_restrictions: 600_000,
        executive_director_compensation: 90_000,
        revenue_streams: [
          { name: 'Government Grants', amount: 450_000 },
          { name: 'Individual Donations', amount: 450_000 },
          { name: 'Program Service Revenue', amount: 300_000 },
          { name: 'Corporate Support', amount: 300_000 },
        ],
      },
    });

    expect(JSON.parse(payload)).toMatchObject({
      ein: '123456789',
      tax_year: 2024,
      health_score: 80,
      source_metrics: {
        top_revenue_source: 'Government Grants',
        reserve_months: 6,
      },
      components: {
        program_expense_ratio: {
          score: 71,
          formula: 'program_service_expenses / total_expenses',
        },
        reserve_months: {
          score: 100,
        },
      },
    });
  });
});

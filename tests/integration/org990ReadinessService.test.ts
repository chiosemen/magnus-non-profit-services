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

import { getOrg990Readiness, putOrg990ReadinessFiling } from '../../apps/org-dashboard-api/src/org990ReadinessService';
import { FORM_990_READINESS_CAVEAT } from '@magnus/reports';

const completeFilingFixture = {
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
};

describe('org990ReadinessService', () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it('returns null when organization is not found', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getOrg990Readiness('missing-org')).resolves.toBeNull();
  });

  it('returns insufficient_data when no filing JSON is stored', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      ein: '123456789',
      name: 'Test Org',
      form990ReadinessFiling: null,
    });

    const dto = await getOrg990Readiness('org-1');
    expect(dto).toMatchObject({
      status: 'insufficient_data',
      requiredFields: expect.any(Array),
    });
    if (dto?.status === 'insufficient_data') {
      expect(dto.requiredFields.length).toBeGreaterThan(0);
      expect(dto.message).toContain('No Form 990 readiness filing');
    }
  });

  it('returns insufficient_data when stored JSON fails Zod validation', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      ein: '123456789',
      name: 'Test Org',
      form990ReadinessFiling: { tax_year: 'not-a-number', filing: {} },
    });

    const dto = await getOrg990Readiness('org-1');
    expect(dto).toMatchObject({ status: 'insufficient_data' });
    if (dto?.status === 'insufficient_data') {
      expect(dto.message).toContain('could not be validated');
    }
  });

  it('returns insufficient_data when filing cannot be scored (fail-closed)', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      ein: '123456789',
      name: 'Test Org',
      form990ReadinessFiling: {
        tax_year: 2024,
        filing: {
          total_revenue: 500_000,
          total_expenses: 450_000,
          net_assets_without_donor_restrictions: 100_000,
          executive_director_compensation: 50_000,
          revenue_streams: [{ name: 'Contributions', amount: 500_000 }],
        },
      },
    });

    const dto = await getOrg990Readiness('org-1');
    expect(dto).toMatchObject({ status: 'insufficient_data' });
    if (dto?.status === 'insufficient_data') {
      expect(dto.requiredFields.some(f => f.includes('program') || f.includes('filing'))).toBe(true);
    }
  });

  it('returns ready DTO aligned with funder report integration fixture', async () => {
    findUnique.mockResolvedValue({
      id: 'org-1',
      ein: '123456789',
      name: 'North Star Youth Center',
      form990ReadinessFiling: completeFilingFixture,
    });

    const dto = await getOrg990Readiness('org-1');
    expect(dto).not.toBeNull();
    if (!dto || dto.status !== 'ready') throw new Error('expected ready');

    expect(dto.overallScore).toBe(80);
    expect(dto.caveat).toBe(FORM_990_READINESS_CAVEAT);
    expect(dto.components).toHaveLength(4);
    expect(dto.components[0]).toMatchObject({
      key: 'program_expense_ratio',
      score: 71,
    });
    expect(dto.components.find(c => c.key === 'revenue_concentration_risk')).toMatchObject({
      score: 82,
    });
    expect(dto.watchouts).toHaveLength(3);
    expect(dto.watchouts[0]).toMatchObject({
      title: 'Executive compensation burden',
      priority: 'medium',
    });
    expect(dto.recommendedActions[0]?.title).toBe('Tighten compensation support');
    expect(dto.reportHtml).toContain('Funder Readiness Report');
    expect(dto.reportHtml).toContain('North Star Youth Center');
  });

  it('persists filing JSON via putOrg990ReadinessFiling', async () => {
    update.mockResolvedValue({});
    await putOrg990ReadinessFiling('org-1', completeFilingFixture);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: {
        form990ReadinessFiling: completeFilingFixture,
      },
    });
  });
});

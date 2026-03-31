import { describe, expect, it } from 'vitest';
import {
  FunderReadinessReportHtmlRenderer,
  FunderReadinessReportService,
} from '@magnus/reports';
import getFunderReadinessReport from '../../apps/mcp-connector/src/tools/financials/get-funder-readiness-report';

describe('FunderReadinessReportService', () => {
  it('maps 990 health scoring into deterministic report sections, watchouts, and actions', () => {
    const service = new FunderReadinessReportService();

    const report = service.generate({
      organizationName: 'North Star Youth Center',
      ein: '123456789',
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

    expect(report.overallScore).toBe(80);
    expect(report.sections.map(section => section.title)).toEqual([
      'Program Expense Ratio',
      'Revenue Concentration Risk',
      'Reserve Months',
      'Executive Compensation Ratio',
    ]);
    expect(report.watchouts).toHaveLength(3);
    expect(report.watchouts[0]).toMatchObject({
      title: 'Executive compensation burden',
      priority: 'medium',
    });
    expect(report.recommendedActions).toHaveLength(3);
    expect(report.recommendedActions[0]?.title).toBe('Tighten compensation support');
  });
});

describe('FunderReadinessReportHtmlRenderer', () => {
  it('renders a print-ready HTML artifact from the report contract', () => {
    const service = new FunderReadinessReportService();
    const renderer = new FunderReadinessReportHtmlRenderer();

    const report = service.generate({
      organizationName: 'North Star Youth Center',
      ein: '123456789',
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

    const html = renderer.render(report);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Funder Readiness Report');
    expect(html).toContain('North Star Youth Center');
    expect(html).toContain('Top 3 Recommended Actions');
    expect(html).toContain('Renderer: funder-readiness-report-html-v1');
  });
});

describe('get-funder-readiness-report tool', () => {
  it('returns the report payload and HTML artifact', async () => {
    const payload = await getFunderReadinessReport.execute({
      ein: '123456789',
      organization_name: 'North Star Youth Center',
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

    const parsed = JSON.parse(payload);

    expect(parsed).toMatchObject({
      report_title: 'North Star Youth Center Funder Readiness Report',
      render_format: 'html-print-ready',
      renderer: 'funder-readiness-report-html-v1',
      report: {
        overall_score: 80,
      },
    });
    expect(parsed.report.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'program_expense_ratio',
        score: 71,
      }),
      expect.objectContaining({
        key: 'revenue_concentration_risk',
        score: 82,
      }),
    ]));
    expect(parsed.html).toContain('North Star Youth Center');
  });
});

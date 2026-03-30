import { z } from 'zod';
import FunderReadinessReportHtmlRenderer from '../../services/FunderReadinessReportHtmlRenderer';
import FunderReadinessReportService from '../../services/FunderReadinessReportService';
import { form990FilingSchema, normalizeForm990FilingInput } from './get-990-health-score';

export const getFunderReadinessReportSchema = z.object({
  ein: z.string().min(9).describe('EIN of the nonprofit'),
  organization_name: z.string().min(1).describe('Organization name for the report header'),
  tax_year: z.number().int().describe('Tax year for the Form 990 data'),
  filing: form990FilingSchema,
});

export type GetFunderReadinessReportInput = z.infer<typeof getFunderReadinessReportSchema>;

const reportService = new FunderReadinessReportService();
const htmlRenderer = new FunderReadinessReportHtmlRenderer();

export async function execute(input: GetFunderReadinessReportInput): Promise<string> {
  const parsed = getFunderReadinessReportSchema.parse(input);
  const report = reportService.generate({
    organizationName: parsed.organization_name,
    ein: parsed.ein,
    taxYear: parsed.tax_year,
    filing: normalizeForm990FilingInput(parsed.filing),
  });
  const html = htmlRenderer.render(report);

  return JSON.stringify({
    ein: parsed.ein,
    organization_name: parsed.organization_name,
    tax_year: parsed.tax_year,
    report_title: `${parsed.organization_name} Funder Readiness Report`,
    render_format: 'html-print-ready',
    renderer: 'funder-readiness-report-html-v1',
    file_name: sanitizeFilename(`${parsed.organization_name}-funder-readiness-report-${parsed.tax_year}.html`),
    report: {
      overall_score: report.overallScore,
      explanation: report.overallExplanation,
      sections: report.sections.map(section => ({
        key: section.key,
        title: section.title,
        score: section.score,
        rating: section.rating,
        metric: section.metricLabel,
        formula: section.formula,
        explanation: section.explanation,
      })),
      watchouts: report.watchouts,
      recommended_actions: report.recommendedActions,
    },
    html,
  }, null, 2);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/-+/g, '-');
}

export default {
  name: 'get-funder-readiness-report',
  schema: getFunderReadinessReportSchema,
  execute,
};

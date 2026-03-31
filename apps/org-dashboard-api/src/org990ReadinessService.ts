import prisma from '@magnus/db/client';
import {
  FORM_990_READINESS_CAVEAT,
  Form990HealthScoreService,
  FunderReadinessReportHtmlRenderer,
  FunderReadinessReportService,
  form990ReadinessStoredSchema,
  normalizeForm990FilingInput,
  type PutForm990ReadinessFilingBody,
  RequiredFieldError,
  ValidationError,
} from '@magnus/reports';

const READINESS_REQUIRED_FIELDS: string[] = [
  'tax_year',
  'filing.total_revenue',
  'filing.total_expenses',
  'filing.program_service_expenses',
  'filing.net_assets_without_donor_restrictions',
  'filing.executive_director_compensation',
  'filing.revenue_streams (non-empty; each stream needs name and amount; amounts must sum above zero)',
];

const healthScoreService = new Form990HealthScoreService();
const reportService = new FunderReadinessReportService();
const htmlRenderer = new FunderReadinessReportHtmlRenderer();

export type Org990ReadinessInsufficient = {
  status: 'insufficient_data';
  message: string;
  requiredFields: string[];
};

export type Org990ReadinessReady = {
  status: 'ready';
  orgId: string;
  ein: string;
  name: string;
  taxYear: number;
  caveat: string;
  overallScore: number;
  explanation: string;
  methodology: string;
  components: Array<{
    key: string;
    title: string;
    score: number;
    weight: number;
    rating: string;
    displayValue: string;
    formula: string;
    explanation: string;
  }>;
  watchouts: Array<{ title: string; detail: string; priority: string }>;
  recommendedActions: Array<{ title: string; detail: string; priority: string }>;
  reportHtml: string;
};

export type Org990ReadinessDto = Org990ReadinessInsufficient | Org990ReadinessReady;

function fieldsFromError(err: unknown): string[] {
  if (err instanceof RequiredFieldError || err instanceof ValidationError) {
    const f = err.field;
    return f ? [f] : READINESS_REQUIRED_FIELDS;
  }
  return READINESS_REQUIRED_FIELDS;
}

export async function getOrg990Readiness(orgId: string): Promise<Org990ReadinessDto | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, ein: true, name: true, form990ReadinessFiling: true },
  });
  if (!org) return null;

  if (org.form990ReadinessFiling == null) {
    return {
      status: 'insufficient_data',
      message:
        'No Form 990 readiness filing is stored for this organization. Save a complete filing to compute scores and the funder readiness report.',
      requiredFields: [...READINESS_REQUIRED_FIELDS],
    };
  }

  const parsedStored = form990ReadinessStoredSchema.safeParse(org.form990ReadinessFiling);
  if (!parsedStored.success) {
    return {
      status: 'insufficient_data',
      message: 'Stored filing data could not be validated. Update the filing with all required fields.',
      requiredFields: [...READINESS_REQUIRED_FIELDS],
    };
  }

  try {
    const filingCamel = normalizeForm990FilingInput(parsedStored.data.filing);
    const health = healthScoreService.score({
      taxYear: parsedStored.data.tax_year,
      filing: filingCamel,
    });
    const report = reportService.generate({
      organizationName: org.name,
      ein: org.ein,
      taxYear: parsedStored.data.tax_year,
      filing: filingCamel,
    });
    const reportHtml = htmlRenderer.render(report);

    const weightByKey: Record<string, number> = {
      program_expense_ratio: health.components.programExpenseRatio.weight,
      revenue_concentration_risk: health.components.revenueConcentrationRisk.weight,
      reserve_months: health.components.reserveMonths.weight,
      executive_compensation_ratio: health.components.executiveCompensationRatio.weight,
    };

    return {
      status: 'ready',
      orgId: org.id,
      ein: org.ein,
      name: org.name,
      taxYear: parsedStored.data.tax_year,
      caveat: FORM_990_READINESS_CAVEAT,
      overallScore: health.score,
      explanation: health.explanation,
      methodology: health.methodology,
      components: report.sections.map(section => ({
        key: section.key,
        title: section.title,
        score: section.score,
        weight: weightByKey[section.key] ?? 0,
        rating: section.rating,
        displayValue: section.metricLabel,
        formula: section.formula,
        explanation: section.explanation,
      })),
      watchouts: report.watchouts.map(w => ({
        title: w.title,
        detail: w.detail,
        priority: w.priority,
      })),
      recommendedActions: report.recommendedActions.map(a => ({
        title: a.title,
        detail: a.detail,
        priority: a.priority,
      })),
      reportHtml,
    };
  } catch (err) {
    return {
      status: 'insufficient_data',
      message:
        err instanceof Error
          ? err.message
          : 'The stored filing could not be scored. Check required numeric fields and revenue streams.',
      requiredFields: fieldsFromError(err),
    };
  }
}

export async function putOrg990ReadinessFiling(orgId: string, body: PutForm990ReadinessFilingBody): Promise<void> {
  await prisma.organization.update({
    where: { id: orgId },
    data: {
      form990ReadinessFiling: {
        tax_year: body.tax_year,
        filing: body.filing,
      },
    },
  });
}

import { z } from 'zod';
import {
  Form990HealthScoreService,
  form990FilingSchema,
  normalizeForm990FilingInput,
  type HealthScoreComponent,
} from '@magnus/reports';

export { form990FilingSchema, normalizeForm990FilingInput };

export const get990HealthScoreSchema = z.object({
  ein: z.string().min(9).describe('EIN of the nonprofit'),
  tax_year: z.number().int().describe('Tax year for the Form 990 data'),
  filing: form990FilingSchema,
});

export type Get990HealthScoreInput = z.infer<typeof get990HealthScoreSchema>;
export type Form990FilingInput = z.infer<typeof form990FilingSchema>;

const service = new Form990HealthScoreService();

export async function execute(input: Get990HealthScoreInput): Promise<string> {
  const { ein, tax_year, filing } = get990HealthScoreSchema.parse(input);
  const result = service.score({
    taxYear: tax_year,
    filing: normalizeForm990FilingInput(filing),
  });

  return JSON.stringify({
    ein,
    tax_year,
    health_score: result.score,
    explanation: result.explanation,
    methodology: result.methodology,
    source_metrics: {
      total_revenue: result.metrics.totalRevenue,
      total_expenses: result.metrics.totalExpenses,
      program_expense_ratio: result.metrics.programExpenseRatio,
      top_revenue_source: result.metrics.topRevenueSource,
      top_revenue_share: result.metrics.topRevenueShare,
      reserve_months: result.metrics.reserveMonths,
      executive_compensation_ratio: result.metrics.executiveCompensationRatio,
    },
    components: {
      program_expense_ratio: serializeComponent(result.components.programExpenseRatio),
      revenue_concentration_risk: serializeComponent(result.components.revenueConcentrationRisk),
      reserve_months: serializeComponent(result.components.reserveMonths),
      executive_compensation_ratio: serializeComponent(result.components.executiveCompensationRatio),
    },
  }, null, 2);
}

function serializeComponent(component: HealthScoreComponent) {
  return {
    score: component.score,
    weight: component.weight,
    rating: component.rating,
    metric_value: component.metricValue,
    display_value: component.displayValue,
    formula: component.formula,
    explanation: component.explanation,
  };
}

export default {
  name: 'get-990-health-score',
  schema: get990HealthScoreSchema,
  execute,
};

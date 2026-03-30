import { z } from 'zod';
import Form990HealthScoreService, {
  HealthScoreComponent,
  RawForm990HealthScoreInput,
} from '../../services/Form990HealthScoreService';

export const form990FilingSchema = z.object({
  total_revenue: z.number().finite().optional(),
  total_expenses: z.number().finite().optional(),
  program_service_expenses: z.number().finite().optional(),
  net_assets_without_donor_restrictions: z.number().finite().optional(),
  executive_director_compensation: z.number().finite().optional(),
  revenue_streams: z.array(z.object({
    name: z.string().min(1).optional(),
    amount: z.number().finite().optional(),
  })).optional(),
}).strict();

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

export function normalizeForm990FilingInput(filing: Form990FilingInput): NonNullable<RawForm990HealthScoreInput['filing']> {
  return {
    ...(filing.total_revenue !== undefined ? { totalRevenue: filing.total_revenue } : {}),
    ...(filing.total_expenses !== undefined ? { totalExpenses: filing.total_expenses } : {}),
    ...(filing.program_service_expenses !== undefined ? { programServiceExpenses: filing.program_service_expenses } : {}),
    ...(filing.net_assets_without_donor_restrictions !== undefined
      ? { netAssetsWithoutDonorRestrictions: filing.net_assets_without_donor_restrictions }
      : {}),
    ...(filing.executive_director_compensation !== undefined
      ? { executiveDirectorCompensation: filing.executive_director_compensation }
      : {}),
    ...(filing.revenue_streams !== undefined
      ? {
        revenueStreams: filing.revenue_streams.map(stream => ({
          ...(stream.name !== undefined ? { name: stream.name } : {}),
          ...(stream.amount !== undefined ? { amount: stream.amount } : {}),
        })),
      }
      : {}),
  };
}

export default {
  name: 'get-990-health-score',
  schema: get990HealthScoreSchema,
  execute,
};

import { z } from 'zod';
import type { RawForm990HealthScoreInput } from './form990HealthScoreService';

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

export type Form990FilingInput = z.infer<typeof form990FilingSchema>;

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

/** Stored JSON on Organization: tax year + snake_case filing (API shape). */
export const form990ReadinessStoredSchema = z.object({
  tax_year: z.number().int(),
  filing: form990FilingSchema,
}).strict();

export type Form990ReadinessStored = z.infer<typeof form990ReadinessStoredSchema>;

export const putForm990ReadinessFilingBodySchema = z.object({
  tax_year: z.number().int(),
  filing: form990FilingSchema,
}).strict();

export type PutForm990ReadinessFilingBody = z.infer<typeof putForm990ReadinessFilingBodySchema>;

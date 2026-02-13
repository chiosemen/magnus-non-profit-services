/**
 * Magnus MCP Tool — get-tax-estimates
 * Filing deadlines, UBIT estimates, quarterly payment schedule
 */

import { z } from 'zod';
import FinancialService from '../../services/FinancialService';
import { formatCurrency } from '../../utils/formatters';

export const getTaxEstimatesSchema = z.object({
  ein: z.string().min(9),
  tax_year: z.number().int().optional(),
  include_quarterly_schedule: z.boolean().default(true),
});

export type GetTaxEstimatesInput = z.infer<typeof getTaxEstimatesSchema>;

const service = new FinancialService();

export async function execute(input: GetTaxEstimatesInput): Promise<string> {
  const { ein, tax_year, include_quarterly_schedule } = getTaxEstimatesSchema.parse(input);
  const estimate = await service.getTaxEstimates(ein, tax_year);

  const today = new Date();
  const filingDue = new Date(estimate.filingDueDate);
  const daysUntilDue = Math.floor((filingDue.getTime() - today.getTime()) / 86400000);

  const output: Record<string, unknown> = {
    ein,
    tax_year: estimate.taxYear,
    filing: {
      form_type: estimate.filingType,
      due_date: estimate.filingDueDate,
      days_until_due: daysUntilDue,
      urgency: daysUntilDue < 0 ? '🔴 OVERDUE' : daysUntilDue < 30 ? '🟠 URGENT' : daysUntilDue < 90 ? '🟡 UPCOMING' : '✅ OK',
      extension_deadline: estimate.extensionDeadline,
      extension_form: 'Form 8868 — extends deadline by 6 months',
    },
    tax_liability: {
      estimated_ubit: formatCurrency(estimate.estimatedUBITaxLiability),
      estimated_state_fees: formatCurrency(estimate.estimatedStateFilingFees),
      total_estimated: formatCurrency(estimate.estimatedUBITaxLiability + estimate.estimatedStateFilingFees),
      note: estimate.estimatedUBITaxLiability === 0
        ? 'No UBIT liability detected — all revenue appears to be from exempt activities'
        : 'UBIT applies to revenue from activities unrelated to exempt purpose',
    },
    notes: estimate.notes,
  };

  if (include_quarterly_schedule) {
    output['quarterly_schedule'] = estimate.quarterlyPaymentSchedule.map(q => ({
      quarter: q.quarter,
      due_date: q.dueDate,
      estimated_payment: formatCurrency(q.estimatedAmount),
    }));
  }

  return JSON.stringify(output, null, 2);
}

export default { name: 'get-tax-estimates', schema: getTaxEstimatesSchema, execute };

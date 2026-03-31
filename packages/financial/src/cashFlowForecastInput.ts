import { z } from 'zod';
import type { RawCashFlowForecastInput } from './cashFlowForecastService';

export const cashFlowEntrySchema = z.object({
  week: z.number().int().min(1).max(13),
  amount: z.number().finite().min(0),
  label: z.string().min(1).optional(),
}).strict();

export const cadenceSchema = z.enum(['weekly', 'biweekly', 'monthly']);

export const payrollScheduleSchema = z.object({
  cadence: cadenceSchema,
  amount: z.number().finite().min(0),
  first_payment_week: z.number().int().min(1).max(13),
}).strict();

export const recurringOperatingExpenseSchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().min(0),
  cadence: cadenceSchema,
  first_due_week: z.number().int().min(1).max(13),
}).strict();

/** Core inputs stored on Organization and accepted by PUT (snake_case API). */
export const cashFlowForecastInputsSchema = z.object({
  current_cash_balance: z.number().finite(),
  expected_grant_inflows: z.array(cashFlowEntrySchema),
  expected_donation_inflows: z.array(cashFlowEntrySchema),
  payroll_schedule: payrollScheduleSchema,
  recurring_operating_expenses: z.array(recurringOperatingExpenseSchema),
  reserve_threshold_target: z.number().finite().min(0).optional(),
}).strict();

export type CashFlowForecastInputsStored = z.infer<typeof cashFlowForecastInputsSchema>;

export const putCashFlowForecastInputsBodySchema = cashFlowForecastInputsSchema;

export type PutCashFlowForecastInputsBody = z.infer<typeof putCashFlowForecastInputsBodySchema>;

/** MCP tool schema = core inputs + display name. */
export const getCashFlowForecastToolSchema = z.object({
  organization_name: z.string().min(1),
}).merge(cashFlowForecastInputsSchema);

export type GetCashFlowForecastToolInput = z.infer<typeof getCashFlowForecastToolSchema>;

export function mapCashFlowStoredToRaw(stored: CashFlowForecastInputsStored): RawCashFlowForecastInput {
  return {
    currentCashBalance: stored.current_cash_balance,
    expectedGrantInflows: stored.expected_grant_inflows.map(entry => ({
      week: entry.week,
      amount: entry.amount,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
    })),
    expectedDonationInflows: stored.expected_donation_inflows.map(entry => ({
      week: entry.week,
      amount: entry.amount,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
    })),
    payrollSchedule: {
      cadence: stored.payroll_schedule.cadence,
      amount: stored.payroll_schedule.amount,
      firstPaymentWeek: stored.payroll_schedule.first_payment_week,
    },
    recurringOperatingExpenses: stored.recurring_operating_expenses.map(expense => ({
      name: expense.name,
      amount: expense.amount,
      cadence: expense.cadence,
      firstDueWeek: expense.first_due_week,
    })),
    ...(stored.reserve_threshold_target !== undefined
      ? { reserveThresholdTarget: stored.reserve_threshold_target }
      : {}),
  };
}

export const CASH_FLOW_FORECAST_CAVEAT =
  'This forecast uses operator-entered assumptions only (not live bank feeds). It supports operational planning and is not a bank reconciliation, general ledger balance, or audited cash position.';

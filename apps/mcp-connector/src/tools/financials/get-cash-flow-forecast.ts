import { z } from 'zod';
import CashFlowForecastService from '../../services/CashFlowForecastService';
import { formatCurrency } from '../../utils/formatters';

const cashFlowEntrySchema = z.object({
  week: z.number().int().min(1).max(13),
  amount: z.number().finite().min(0),
  label: z.string().min(1).optional(),
}).strict();

const cadenceSchema = z.enum(['weekly', 'biweekly', 'monthly']);

const payrollScheduleSchema = z.object({
  cadence: cadenceSchema,
  amount: z.number().finite().min(0),
  first_payment_week: z.number().int().min(1).max(13),
}).strict();

const recurringOperatingExpenseSchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().min(0),
  cadence: cadenceSchema,
  first_due_week: z.number().int().min(1).max(13),
}).strict();

export const getCashFlowForecastSchema = z.object({
  organization_name: z.string().min(1).describe('Organization name for the forecast header'),
  current_cash_balance: z.number().finite().describe('Current unrestricted cash balance'),
  expected_grant_inflows: z.array(cashFlowEntrySchema).describe('Expected grant inflows bucketed into forecast weeks'),
  expected_donation_inflows: z.array(cashFlowEntrySchema).describe('Expected donation inflows bucketed into forecast weeks'),
  payroll_schedule: payrollScheduleSchema.describe('Payroll cadence, amount, and first payment week'),
  recurring_operating_expenses: z.array(recurringOperatingExpenseSchema)
    .describe('Recurring operating expenses to model over the 13-week horizon'),
  reserve_threshold_target: z.number().finite().min(0).optional()
    .describe('Optional low-cash target; defaults to zero if omitted'),
});

export type GetCashFlowForecastInput = z.infer<typeof getCashFlowForecastSchema>;

const service = new CashFlowForecastService();

export async function execute(input: GetCashFlowForecastInput): Promise<string> {
  const parsed = getCashFlowForecastSchema.parse(input);
  const forecast = service.forecast({
    currentCashBalance: parsed.current_cash_balance,
    expectedGrantInflows: parsed.expected_grant_inflows.map(entry => ({
      week: entry.week,
      amount: entry.amount,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
    })),
    expectedDonationInflows: parsed.expected_donation_inflows.map(entry => ({
      week: entry.week,
      amount: entry.amount,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
    })),
    payrollSchedule: {
      cadence: parsed.payroll_schedule.cadence,
      amount: parsed.payroll_schedule.amount,
      firstPaymentWeek: parsed.payroll_schedule.first_payment_week,
    },
    recurringOperatingExpenses: parsed.recurring_operating_expenses.map(expense => ({
      name: expense.name,
      amount: expense.amount,
      cadence: expense.cadence,
      firstDueWeek: expense.first_due_week,
    })),
    ...(parsed.reserve_threshold_target !== undefined
      ? { reserveThresholdTarget: parsed.reserve_threshold_target }
      : {}),
  });

  return JSON.stringify({
    organization_name: parsed.organization_name,
    forecast_horizon_weeks: 13,
    methodology: forecast.methodology,
    user_input: {
      current_cash_balance: {
        amount: formatCurrency(forecast.inputs.currentCashBalance),
        amount_raw: forecast.inputs.currentCashBalance,
      },
      expected_grant_inflows: forecast.inputs.expectedGrantInflows.map(entry => ({
        week: entry.week,
        label: entry.label,
        amount: formatCurrency(entry.amount),
        amount_raw: entry.amount,
      })),
      expected_donation_inflows: forecast.inputs.expectedDonationInflows.map(entry => ({
        week: entry.week,
        label: entry.label,
        amount: formatCurrency(entry.amount),
        amount_raw: entry.amount,
      })),
      payroll_schedule: {
        cadence: forecast.inputs.payrollSchedule.cadence,
        amount: formatCurrency(forecast.inputs.payrollSchedule.amount),
        amount_raw: forecast.inputs.payrollSchedule.amount,
        first_payment_week: forecast.inputs.payrollSchedule.firstPaymentWeek,
      },
      recurring_operating_expenses: forecast.inputs.recurringOperatingExpenses.map(expense => ({
        name: expense.name,
        cadence: expense.cadence,
        first_due_week: expense.firstDueWeek,
        amount: formatCurrency(expense.amount),
        amount_raw: expense.amount,
      })),
      reserve_threshold_target: {
        amount: formatCurrency(forecast.calculated.threshold),
        amount_raw: forecast.calculated.threshold,
        source: forecast.calculated.thresholdSource,
      },
    },
    calculated_output: {
      projected_ending_cash: formatCurrency(forecast.calculated.projectedEndingCash),
      projected_ending_cash_raw: forecast.calculated.projectedEndingCash,
      lowest_projected_cash: formatCurrency(forecast.calculated.lowestProjectedCash),
      lowest_projected_cash_raw: forecast.calculated.lowestProjectedCash,
      lowest_cash_week: forecast.calculated.lowestCashWeek,
      total_projected_inflows: formatCurrency(forecast.calculated.totalInflows),
      total_projected_inflows_raw: forecast.calculated.totalInflows,
      total_projected_outflows: formatCurrency(forecast.calculated.totalOutflows),
      total_projected_outflows_raw: forecast.calculated.totalOutflows,
      low_cash_alert: {
        triggered: forecast.calculated.lowCashAlert.triggered,
        threshold: formatCurrency(forecast.calculated.threshold),
        threshold_raw: forecast.calculated.threshold,
        weeks_below_threshold: forecast.calculated.lowCashAlert.weeksBelowThreshold,
        explanation: forecast.calculated.lowCashAlert.explanation,
      },
      highest_risk_weeks: forecast.calculated.highestRiskWeeks.map(week => ({
        week: week.weekNumber,
        projected_ending_cash: formatCurrency(week.endingCash),
        projected_ending_cash_raw: week.endingCash,
        below_threshold: week.belowThreshold,
        explanation: week.explanation,
      })),
      weekly_projection: forecast.calculated.weeks.map(week => ({
        week: week.weekNumber,
        starting_cash: formatCurrency(week.startingCash),
        starting_cash_raw: week.startingCash,
        inflows: {
          grants: formatCurrency(week.inflows.grants),
          grants_raw: week.inflows.grants,
          donations: formatCurrency(week.inflows.donations),
          donations_raw: week.inflows.donations,
          total: formatCurrency(week.inflows.total),
          total_raw: week.inflows.total,
        },
        outflows: {
          payroll: formatCurrency(week.outflows.payroll),
          payroll_raw: week.outflows.payroll,
          recurring_operating: formatCurrency(week.outflows.recurringOperating),
          recurring_operating_raw: week.outflows.recurringOperating,
          total: formatCurrency(week.outflows.total),
          total_raw: week.outflows.total,
        },
        net_change: formatCurrency(week.netChange),
        net_change_raw: week.netChange,
        ending_cash: formatCurrency(week.endingCash),
        ending_cash_raw: week.endingCash,
        below_threshold: week.belowThreshold,
      })),
    },
  }, null, 2);
}

export default {
  name: 'get-cash-flow-forecast',
  schema: getCashFlowForecastSchema,
  execute,
};

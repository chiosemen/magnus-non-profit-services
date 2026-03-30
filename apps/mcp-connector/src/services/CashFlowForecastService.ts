import { RequiredFieldError, ValidationError } from '../utils/errors';

export type CashFlowCadence = 'weekly' | 'biweekly' | 'monthly';

export interface RawCashFlowInflowsInput {
  week?: number;
  amount?: number;
  label?: string;
}

export interface RawPayrollScheduleInput {
  cadence?: CashFlowCadence;
  amount?: number;
  firstPaymentWeek?: number;
}

export interface RawRecurringExpenseInput {
  name?: string;
  amount?: number;
  cadence?: CashFlowCadence;
  firstDueWeek?: number;
}

export interface RawCashFlowForecastInput {
  currentCashBalance?: number;
  expectedGrantInflows?: RawCashFlowInflowsInput[];
  expectedDonationInflows?: RawCashFlowInflowsInput[];
  payrollSchedule?: RawPayrollScheduleInput;
  recurringOperatingExpenses?: RawRecurringExpenseInput[];
  reserveThresholdTarget?: number;
}

export interface CashFlowInflows {
  week: number;
  amount: number;
  label: string;
}

export interface PayrollSchedule {
  cadence: CashFlowCadence;
  amount: number;
  firstPaymentWeek: number;
}

export interface RecurringExpense {
  name: string;
  amount: number;
  cadence: CashFlowCadence;
  firstDueWeek: number;
}

export interface CashFlowForecastInput {
  currentCashBalance: number;
  expectedGrantInflows: CashFlowInflows[];
  expectedDonationInflows: CashFlowInflows[];
  payrollSchedule: PayrollSchedule;
  recurringOperatingExpenses: RecurringExpense[];
  reserveThresholdTarget?: number;
}

export interface CashFlowForecastWeek {
  weekNumber: number;
  startingCash: number;
  inflows: {
    grants: number;
    donations: number;
    total: number;
  };
  outflows: {
    payroll: number;
    recurringOperating: number;
    total: number;
  };
  netChange: number;
  endingCash: number;
  belowThreshold: boolean;
}

export interface CashFlowRiskWeek {
  weekNumber: number;
  endingCash: number;
  belowThreshold: boolean;
  explanation: string;
}

export interface CashFlowForecastResult {
  inputs: CashFlowForecastInput;
  calculated: {
    threshold: number;
    thresholdSource: 'reserve_target' | 'default_zero_floor';
    projectedEndingCash: number;
    lowestProjectedCash: number;
    lowestCashWeek: number;
    totalInflows: number;
    totalOutflows: number;
    lowCashAlert: {
      triggered: boolean;
      weeksBelowThreshold: number[];
      explanation: string;
    };
    highestRiskWeeks: CashFlowRiskWeek[];
    weeks: CashFlowForecastWeek[];
  };
  methodology: string;
}

const FORECAST_WEEKS = 13;

export class CashFlowForecastService {
  forecast(raw: RawCashFlowForecastInput): CashFlowForecastResult {
    const inputs = this.normalize(raw);
    const threshold = inputs.reserveThresholdTarget ?? 0;
    const thresholdSource = inputs.reserveThresholdTarget !== undefined ? 'reserve_target' : 'default_zero_floor';

    const weeks: CashFlowForecastWeek[] = [];
    let runningCash = inputs.currentCashBalance;

    for (let weekNumber = 1; weekNumber <= FORECAST_WEEKS; weekNumber += 1) {
      const grantInflows = sumEntriesForWeek(inputs.expectedGrantInflows, weekNumber);
      const donationInflows = sumEntriesForWeek(inputs.expectedDonationInflows, weekNumber);
      const payrollOutflow = occursInWeek(
        inputs.payrollSchedule.cadence,
        inputs.payrollSchedule.firstPaymentWeek,
        weekNumber
      )
        ? inputs.payrollSchedule.amount
        : 0;
      const recurringOutflow = inputs.recurringOperatingExpenses.reduce((sum, expense) => (
        occursInWeek(expense.cadence, expense.firstDueWeek, weekNumber)
          ? sum + expense.amount
          : sum
      ), 0);

      const totalInflows = grantInflows + donationInflows;
      const totalOutflows = payrollOutflow + recurringOutflow;
      const startingCash = runningCash;
      const endingCash = startingCash + totalInflows - totalOutflows;

      weeks.push({
        weekNumber,
        startingCash,
        inflows: {
          grants: grantInflows,
          donations: donationInflows,
          total: totalInflows,
        },
        outflows: {
          payroll: payrollOutflow,
          recurringOperating: recurringOutflow,
          total: totalOutflows,
        },
        netChange: totalInflows - totalOutflows,
        endingCash,
        belowThreshold: endingCash < threshold,
      });

      runningCash = endingCash;
    }

    const weeksBelowThreshold = weeks
      .filter(week => week.belowThreshold)
      .map(week => week.weekNumber);
    const lowestCashWeek = weeks.reduce((lowest, current) => (
      current.endingCash < lowest.endingCash ? current : lowest
    ));
    const highestRiskWeeks = [...weeks]
      .sort((left, right) => (
        Number(right.belowThreshold) - Number(left.belowThreshold) ||
        left.endingCash - right.endingCash ||
        left.weekNumber - right.weekNumber
      ))
      .slice(0, 3)
      .map(week => ({
        weekNumber: week.weekNumber,
        endingCash: week.endingCash,
        belowThreshold: week.belowThreshold,
        explanation: buildRiskWeekExplanation(week, threshold),
      }));

    return {
      inputs,
      calculated: {
        threshold,
        thresholdSource,
        projectedEndingCash: weeks[weeks.length - 1]!.endingCash,
        lowestProjectedCash: lowestCashWeek.endingCash,
        lowestCashWeek: lowestCashWeek.weekNumber,
        totalInflows: weeks.reduce((sum, week) => sum + week.inflows.total, 0),
        totalOutflows: weeks.reduce((sum, week) => sum + week.outflows.total, 0),
        lowCashAlert: {
          triggered: weeksBelowThreshold.length > 0,
          weeksBelowThreshold,
          explanation: buildLowCashAlertExplanation(weeksBelowThreshold, threshold, lowestCashWeek),
        },
        highestRiskWeeks,
        weeks,
      },
      methodology: 'Deterministic 13-week cash flow forecast using manual weekly inflow entries plus recurring payroll and operating outflows. Monthly cadence is modeled as every 4 weeks in this v1.',
    };
  }

  private normalize(raw: RawCashFlowForecastInput): CashFlowForecastInput {
    const currentCashBalance = this.requireFiniteNumber(raw.currentCashBalance, 'current_cash_balance');
    const expectedGrantInflows = this.normalizeInflows(raw.expectedGrantInflows, 'expected_grant_inflows');
    const expectedDonationInflows = this.normalizeInflows(raw.expectedDonationInflows, 'expected_donation_inflows');
    const payrollSchedule = this.normalizePayrollSchedule(raw.payrollSchedule);
    const recurringOperatingExpenses = this.normalizeRecurringExpenses(raw.recurringOperatingExpenses);

    const reserveThresholdTarget = raw.reserveThresholdTarget;
    if (reserveThresholdTarget !== undefined) {
      this.requireNonNegativeNumber(reserveThresholdTarget, 'reserve_threshold_target');
    }

    return {
      currentCashBalance,
      expectedGrantInflows,
      expectedDonationInflows,
      payrollSchedule,
      recurringOperatingExpenses,
      ...(reserveThresholdTarget !== undefined ? { reserveThresholdTarget } : {}),
    };
  }

  private normalizeInflows(
    input: RawCashFlowInflowsInput[] | undefined,
    field: 'expected_grant_inflows' | 'expected_donation_inflows'
  ): CashFlowInflows[] {
    if (!Array.isArray(input)) throw new RequiredFieldError(field);

    return input.map((entry, index) => ({
      week: this.requireWeek(entry.week, `${field}[${index}].week`),
      amount: this.requireNonNegativeNumber(entry.amount, `${field}[${index}].amount`),
      label: entry.label?.trim() || defaultInflowLabel(field),
    }));
  }

  private normalizePayrollSchedule(input: RawPayrollScheduleInput | undefined): PayrollSchedule {
    if (!input) throw new RequiredFieldError('payroll_schedule');

    return {
      cadence: this.requireCadence(input.cadence, 'payroll_schedule.cadence'),
      amount: this.requireNonNegativeNumber(input.amount, 'payroll_schedule.amount'),
      firstPaymentWeek: this.requireWeek(input.firstPaymentWeek, 'payroll_schedule.first_payment_week'),
    };
  }

  private normalizeRecurringExpenses(input: RawRecurringExpenseInput[] | undefined): RecurringExpense[] {
    if (!Array.isArray(input)) throw new RequiredFieldError('recurring_operating_expenses');

    return input.map((expense, index) => {
      const name = expense.name?.trim();
      if (!name) throw new RequiredFieldError(`recurring_operating_expenses[${index}].name`);

      return {
        name,
        amount: this.requireNonNegativeNumber(
          expense.amount,
          `recurring_operating_expenses[${index}].amount`
        ),
        cadence: this.requireCadence(
          expense.cadence,
          `recurring_operating_expenses[${index}].cadence`
        ),
        firstDueWeek: this.requireWeek(
          expense.firstDueWeek,
          `recurring_operating_expenses[${index}].first_due_week`
        ),
      };
    });
  }

  private requireCadence(value: CashFlowCadence | undefined, field: string): CashFlowCadence {
    if (!value) throw new RequiredFieldError(field);
    if (!['weekly', 'biweekly', 'monthly'].includes(value)) {
      throw new ValidationError(`${field} must be weekly, biweekly, or monthly`, field, value);
    }
    return value;
  }

  private requireWeek(value: number | undefined, field: string): number {
    if (value === undefined) throw new RequiredFieldError(field);
    if (!Number.isInteger(value) || value < 1 || value > FORECAST_WEEKS) {
      throw new ValidationError(`${field} must be an integer between 1 and 13`, field, value);
    }
    return value;
  }

  private requireFiniteNumber(value: number | undefined, field: string): number {
    if (value === undefined) throw new RequiredFieldError(field);
    if (!Number.isFinite(value)) {
      throw new ValidationError(`${field} must be a finite number`, field, value);
    }
    return value;
  }

  private requireNonNegativeNumber(value: number | undefined, field: string): number {
    const parsed = this.requireFiniteNumber(value, field);
    if (parsed < 0) {
      throw new ValidationError(`${field} must be zero or greater`, field, parsed);
    }
    return parsed;
  }
}

function cadenceInterval(cadence: CashFlowCadence): number {
  switch (cadence) {
    case 'weekly':
      return 1;
    case 'biweekly':
      return 2;
    case 'monthly':
      return 4;
  }
}

function occursInWeek(cadence: CashFlowCadence, firstWeek: number, weekNumber: number): boolean {
  if (weekNumber < firstWeek) return false;
  return (weekNumber - firstWeek) % cadenceInterval(cadence) === 0;
}

function sumEntriesForWeek(entries: CashFlowInflows[], weekNumber: number): number {
  return entries.reduce((sum, entry) => (
    entry.week === weekNumber ? sum + entry.amount : sum
  ), 0);
}

function defaultInflowLabel(field: 'expected_grant_inflows' | 'expected_donation_inflows'): string {
  return field === 'expected_grant_inflows' ? 'Grant inflow' : 'Donation inflow';
}

function buildLowCashAlertExplanation(
  weeksBelowThreshold: number[],
  threshold: number,
  lowestCashWeek: CashFlowForecastWeek
): string {
  if (weeksBelowThreshold.length === 0) {
    return `No low-cash alert. The lowest projected ending cash is ${formatCurrency(lowestCashWeek.endingCash)} in week ${lowestCashWeek.weekNumber} against a ${formatCurrency(threshold)} threshold.`;
  }

  return `Low-cash alert triggered in week${weeksBelowThreshold.length > 1 ? 's' : ''} ${weeksBelowThreshold.join(', ')} because projected ending cash falls below the ${formatCurrency(threshold)} threshold. The lowest point is ${formatCurrency(lowestCashWeek.endingCash)} in week ${lowestCashWeek.weekNumber}.`;
}

function buildRiskWeekExplanation(week: CashFlowForecastWeek, threshold: number): string {
  const thresholdText = week.belowThreshold
    ? ` This lands ${formatCurrency(threshold - week.endingCash)} below the threshold.`
    : '';

  return `Week ${week.weekNumber} ends at ${formatCurrency(week.endingCash)} after ${formatCurrency(week.outflows.total)} in outflows and ${formatCurrency(week.inflows.total)} in inflows.${thresholdText}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default CashFlowForecastService;

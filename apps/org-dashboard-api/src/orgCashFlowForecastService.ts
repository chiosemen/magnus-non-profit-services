import prisma from '@magnus/db/client';
import {
  CashFlowForecastService,
  CASH_FLOW_FORECAST_CAVEAT,
  cashFlowForecastInputsSchema,
  mapCashFlowStoredToRaw,
  type PutCashFlowForecastInputsBody,
  RequiredFieldError,
  ValidationError,
} from '@magnus/financial';

const service = new CashFlowForecastService();

const READINESS_REQUIRED_FIELDS: string[] = [
  'current_cash_balance',
  'expected_grant_inflows',
  'expected_donation_inflows',
  'payroll_schedule',
  'recurring_operating_expenses',
];

function fieldsFromError(err: unknown): string[] {
  if (err instanceof RequiredFieldError || err instanceof ValidationError) {
    const f = err.field;
    return f ? [f] : READINESS_REQUIRED_FIELDS;
  }
  return READINESS_REQUIRED_FIELDS;
}

export type OrgCashFlowForecastInsufficient = {
  status: 'insufficient_data';
  message: string;
  requiredFields: string[];
};

export type OrgCashFlowForecastReady = {
  status: 'ready';
  orgId: string;
  name: string;
  caveat: string;
  methodology: string;
  horizonWeeks: number;
  currentCashBalance: number;
  projectedEndingCash: number;
  thresholdUsd: number;
  thresholdSource: 'reserve_target' | 'default_zero_floor';
  lowCashAlert: {
    triggered: boolean;
    weeksBelowThreshold: number[];
    explanation: string;
  };
  highestRiskWeeks: Array<{
    weekNumber: number;
    endingCash: number;
    belowThreshold: boolean;
    explanation: string;
  }>;
  summary: {
    totalInflows: number;
    totalOutflows: number;
    netOverHorizon: number;
    lowestProjectedCash: number;
    lowestCashWeek: number;
  };
  assumptions: PutCashFlowForecastInputsBody;
  weeklyEndingCashTrend: Array<{
    weekNumber: number;
    endingCash: number;
    belowThreshold: boolean;
  }>;
};

export type OrgCashFlowForecastDto = OrgCashFlowForecastInsufficient | OrgCashFlowForecastReady;

export async function getOrgCashFlowForecast(orgId: string): Promise<OrgCashFlowForecastDto | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, cashFlowForecastInputs: true },
  });
  if (!org) return null;

  if (org.cashFlowForecastInputs == null) {
    return {
      status: 'insufficient_data',
      message:
        'No cash flow assumptions are stored for this organization. Save a complete assumption set to run the 13-week deterministic forecast.',
      requiredFields: [...READINESS_REQUIRED_FIELDS],
    };
  }

  const parsedStored = cashFlowForecastInputsSchema.safeParse(org.cashFlowForecastInputs);
  if (!parsedStored.success) {
    return {
      status: 'insufficient_data',
      message: 'Stored cash flow inputs could not be validated. Update them with all required fields.',
      requiredFields: [...READINESS_REQUIRED_FIELDS],
    };
  }

  try {
    const forecast = service.forecast(mapCashFlowStoredToRaw(parsedStored.data));
    const { calculated, inputs, methodology } = forecast;

    return {
      status: 'ready',
      orgId: org.id,
      name: org.name,
      caveat: CASH_FLOW_FORECAST_CAVEAT,
      methodology,
      horizonWeeks: 13,
      currentCashBalance: inputs.currentCashBalance,
      projectedEndingCash: calculated.projectedEndingCash,
      thresholdUsd: calculated.threshold,
      thresholdSource: calculated.thresholdSource,
      lowCashAlert: {
        triggered: calculated.lowCashAlert.triggered,
        weeksBelowThreshold: calculated.lowCashAlert.weeksBelowThreshold,
        explanation: calculated.lowCashAlert.explanation,
      },
      highestRiskWeeks: calculated.highestRiskWeeks.map(w => ({
        weekNumber: w.weekNumber,
        endingCash: w.endingCash,
        belowThreshold: w.belowThreshold,
        explanation: w.explanation,
      })),
      summary: {
        totalInflows: calculated.totalInflows,
        totalOutflows: calculated.totalOutflows,
        netOverHorizon: calculated.totalInflows - calculated.totalOutflows,
        lowestProjectedCash: calculated.lowestProjectedCash,
        lowestCashWeek: calculated.lowestCashWeek,
      },
      assumptions: parsedStored.data,
      weeklyEndingCashTrend: calculated.weeks.map(w => ({
        weekNumber: w.weekNumber,
        endingCash: w.endingCash,
        belowThreshold: w.belowThreshold,
      })),
    };
  } catch (err) {
    return {
      status: 'insufficient_data',
      message:
        err instanceof Error
          ? err.message
          : 'The stored assumptions could not be converted into a forecast.',
      requiredFields: fieldsFromError(err),
    };
  }
}

export async function putOrgCashFlowForecastInputs(orgId: string, body: PutCashFlowForecastInputsBody): Promise<void> {
  await prisma.organization.update({
    where: { id: orgId },
    data: { cashFlowForecastInputs: body },
  });
}

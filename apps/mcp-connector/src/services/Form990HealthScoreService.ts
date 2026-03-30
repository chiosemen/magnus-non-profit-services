import { RequiredFieldError, ValidationError } from '../utils/errors';

export interface RawForm990RevenueStreamInput {
  name?: string;
  amount?: number;
}

export interface RawForm990HealthScoreInput {
  taxYear?: number;
  filing?: {
    totalRevenue?: number;
    totalExpenses?: number;
    programServiceExpenses?: number;
    netAssetsWithoutDonorRestrictions?: number;
    executiveDirectorCompensation?: number;
    revenueStreams?: RawForm990RevenueStreamInput[];
  };
}

export interface Form990RevenueStream {
  name: string;
  amount: number;
}

export interface Form990HealthScoreInput {
  taxYear: number;
  filing: {
    totalRevenue: number;
    totalExpenses: number;
    programServiceExpenses: number;
    netAssetsWithoutDonorRestrictions: number;
    executiveDirectorCompensation: number;
    revenueStreams: Form990RevenueStream[];
  };
}

export interface HealthScoreComponent {
  score: number;
  weight: number;
  metricValue: number;
  displayValue: string;
  formula: string;
  explanation: string;
  rating: 'strong' | 'stable' | 'watch' | 'weak';
}

export interface Form990HealthScoreResult {
  score: number;
  explanation: string;
  methodology: string;
  taxYear: number;
  components: {
    programExpenseRatio: HealthScoreComponent;
    revenueConcentrationRisk: HealthScoreComponent;
    reserveMonths: HealthScoreComponent;
    executiveCompensationRatio: HealthScoreComponent;
  };
  metrics: {
    totalRevenue: number;
    totalExpenses: number;
    programExpenseRatio: number;
    topRevenueShare: number;
    topRevenueSource: string;
    reserveMonths: number;
    executiveCompensationRatio: number;
  };
}

const PROGRAM_WEIGHT = 0.35;
const CONCENTRATION_WEIGHT = 0.25;
const RESERVES_WEIGHT = 0.25;
const EXEC_COMP_WEIGHT = 0.15;

export class Form990HealthScoreService {
  score(raw: RawForm990HealthScoreInput): Form990HealthScoreResult {
    const input = this.normalize(raw);
    const { filing } = input;

    const programExpenseRatio = filing.programServiceExpenses / filing.totalExpenses;
    const topRevenueStream = filing.revenueStreams.reduce((highest, current) => (
      current.amount > highest.amount ? current : highest
    ));
    const revenueStreamTotal = filing.revenueStreams.reduce((sum, stream) => sum + stream.amount, 0);
    const topRevenueShare = revenueStreamTotal > 0 ? topRevenueStream.amount / revenueStreamTotal : 0;
    const reserveMonths = filing.netAssetsWithoutDonorRestrictions / (filing.totalExpenses / 12);
    const executiveCompensationRatio = filing.executiveDirectorCompensation / filing.totalExpenses;

    const programScore = linearAscending(programExpenseRatio, 0.5, 0.85);
    const concentrationScore = linearDescending(topRevenueShare, 0.2, 0.75);
    const reservesScore = linearAscending(reserveMonths, 0, 6);
    const executiveCompScore = linearDescending(executiveCompensationRatio, 0.03, 0.15);

    const programComponent: HealthScoreComponent = {
      score: programScore,
      weight: PROGRAM_WEIGHT,
      metricValue: programExpenseRatio,
      displayValue: formatPercent(programExpenseRatio),
      formula: 'program_service_expenses / total_expenses',
      explanation: `Program services consumed ${formatCurrency(filing.programServiceExpenses)} of ${formatCurrency(filing.totalExpenses)} in total expenses, producing a ${formatPercent(programExpenseRatio)} program expense ratio. v1 awards 0 points at 50% or below and 100 points at 85% or above.`,
      rating: scoreRating(programScore),
    };

    const concentrationComponent: HealthScoreComponent = {
      score: concentrationScore,
      weight: CONCENTRATION_WEIGHT,
      metricValue: topRevenueShare,
      displayValue: formatPercent(topRevenueShare),
      formula: 'largest_revenue_stream / total_revenue_from_revenue_streams',
      explanation: `${topRevenueStream.name} is the largest named revenue stream at ${formatCurrency(topRevenueStream.amount)}, or ${formatPercent(topRevenueShare)} of the provided revenue mix. v1 awards 100 points at 20% concentration or lower and 0 points at 75% or higher.`,
      rating: scoreRating(concentrationScore),
    };

    const reservesComponent: HealthScoreComponent = {
      score: reservesScore,
      weight: RESERVES_WEIGHT,
      metricValue: reserveMonths,
      displayValue: formatMonths(reserveMonths),
      formula: 'net_assets_without_donor_restrictions / (total_expenses / 12)',
      explanation: `${formatCurrency(filing.netAssetsWithoutDonorRestrictions)} in net assets without donor restrictions covers ${formatMonths(reserveMonths)} of expenses at the current annual spend level. v1 awards 100 points at 6.0 reserve months or above.`,
      rating: scoreRating(reservesScore),
    };

    const executiveCompComponent: HealthScoreComponent = {
      score: executiveCompScore,
      weight: EXEC_COMP_WEIGHT,
      metricValue: executiveCompensationRatio,
      displayValue: formatPercent(executiveCompensationRatio),
      formula: 'executive_director_compensation / total_expenses',
      explanation: `Executive compensation is ${formatCurrency(filing.executiveDirectorCompensation)} against ${formatCurrency(filing.totalExpenses)} in total expenses, which is a ${formatPercent(executiveCompensationRatio)} compensation ratio. v1 awards 100 points at 3% or lower and 0 points at 15% or higher.`,
      rating: scoreRating(executiveCompScore),
    };

    const score = Math.round(
      (programComponent.score * programComponent.weight) +
      (concentrationComponent.score * concentrationComponent.weight) +
      (reservesComponent.score * reservesComponent.weight) +
      (executiveCompComponent.score * executiveCompComponent.weight)
    );

    return {
      score,
      explanation: `Overall 990 Health Score is ${score}/100. Program spending is ${programComponent.rating}, revenue concentration is ${concentrationComponent.rating}, reserves are ${reservesComponent.rating}, and executive compensation burden is ${executiveCompComponent.rating}.`,
      methodology: 'Deterministic weighted score using four transparent Form 990 metrics. This v1 expects the provided revenue streams to represent the full annual revenue mix.',
      taxYear: input.taxYear,
      components: {
        programExpenseRatio: programComponent,
        revenueConcentrationRisk: concentrationComponent,
        reserveMonths: reservesComponent,
        executiveCompensationRatio: executiveCompComponent,
      },
      metrics: {
        totalRevenue: filing.totalRevenue,
        totalExpenses: filing.totalExpenses,
        programExpenseRatio,
        topRevenueShare,
        topRevenueSource: topRevenueStream.name,
        reserveMonths,
        executiveCompensationRatio,
      },
    };
  }

  private normalize(raw: RawForm990HealthScoreInput): Form990HealthScoreInput {
    const filing = raw.filing;
    if (!filing) throw new RequiredFieldError('filing');

    const taxYear = this.requirePositiveNumber(raw.taxYear, 'tax_year');
    const totalRevenue = this.requirePositiveNumber(filing.totalRevenue, 'filing.total_revenue');
    const totalExpenses = this.requirePositiveNumber(filing.totalExpenses, 'filing.total_expenses');
    const programServiceExpenses = this.requireNonNegativeNumber(
      filing.programServiceExpenses,
      'filing.program_service_expenses'
    );
    const netAssetsWithoutDonorRestrictions = this.requireFiniteNumber(
      filing.netAssetsWithoutDonorRestrictions,
      'filing.net_assets_without_donor_restrictions'
    );
    const executiveDirectorCompensation = this.requireNonNegativeNumber(
      filing.executiveDirectorCompensation,
      'filing.executive_director_compensation'
    );

    if (programServiceExpenses > totalExpenses) {
      throw new ValidationError(
        'Program service expenses cannot exceed total expenses',
        'filing.program_service_expenses',
        programServiceExpenses
      );
    }

    const revenueStreams = this.normalizeRevenueStreams(filing.revenueStreams);

    return {
      taxYear,
      filing: {
        totalRevenue,
        totalExpenses,
        programServiceExpenses,
        netAssetsWithoutDonorRestrictions,
        executiveDirectorCompensation,
        revenueStreams,
      },
    };
  }

  private normalizeRevenueStreams(input: RawForm990RevenueStreamInput[] | undefined): Form990RevenueStream[] {
    if (!Array.isArray(input) || input.length === 0) {
      throw new RequiredFieldError('filing.revenue_streams');
    }

    const streams = input.map((stream, index) => {
      const name = stream.name?.trim();
      if (!name) throw new RequiredFieldError(`filing.revenue_streams[${index}].name`);

      const amount = this.requireNonNegativeNumber(
        stream.amount,
        `filing.revenue_streams[${index}].amount`
      );

      return { name, amount };
    });

    const total = streams.reduce((sum, stream) => sum + stream.amount, 0);
    if (total <= 0) {
      throw new ValidationError(
        'Revenue streams must sum to more than zero',
        'filing.revenue_streams',
        total
      );
    }

    return streams;
  }

  private requireFiniteNumber(value: number | undefined, field: string): number {
    if (value === undefined) throw new RequiredFieldError(field);
    if (!Number.isFinite(value)) {
      throw new ValidationError(`${field} must be a finite number`, field, value);
    }
    return value;
  }

  private requirePositiveNumber(value: number | undefined, field: string): number {
    const parsed = this.requireFiniteNumber(value, field);
    if (parsed <= 0) {
      throw new ValidationError(`${field} must be greater than zero`, field, parsed);
    }
    return parsed;
  }

  private requireNonNegativeNumber(value: number | undefined, field: string): number {
    const parsed = this.requireFiniteNumber(value, field);
    if (parsed < 0) {
      throw new ValidationError(`${field} must be zero or greater`, field, parsed);
    }
    return parsed;
  }
}

function linearAscending(value: number, floor: number, ceiling: number): number {
  if (value <= floor) return 0;
  if (value >= ceiling) return 100;
  return Math.round(((value - floor) / (ceiling - floor)) * 100);
}

function linearDescending(value: number, best: number, worst: number): number {
  if (value <= best) return 100;
  if (value >= worst) return 0;
  return Math.round(((worst - value) / (worst - best)) * 100);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMonths(value: number): string {
  return `${value.toFixed(1)} months`;
}

function scoreRating(score: number): HealthScoreComponent['rating'] {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'stable';
  if (score >= 40) return 'watch';
  return 'weak';
}

export default Form990HealthScoreService;

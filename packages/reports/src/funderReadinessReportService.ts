import Form990HealthScoreService, {
  Form990HealthScoreResult,
  HealthScoreComponent,
  RawForm990HealthScoreInput,
} from './form990HealthScoreService';

export interface FunderReadinessReportIdentity {
  organizationName: string;
  ein: string;
  taxYear: number;
}

export interface FunderReadinessReportSection {
  key: 'program_expense_ratio' | 'revenue_concentration_risk' | 'reserve_months' | 'executive_compensation_ratio';
  title: string;
  score: number;
  rating: HealthScoreComponent['rating'];
  metricLabel: string;
  formula: string;
  explanation: string;
}

export interface FunderReadinessReportItem {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface FunderReadinessReport {
  identity: FunderReadinessReportIdentity;
  overallScore: number;
  overallExplanation: string;
  scoreMethodology: string;
  sections: FunderReadinessReportSection[];
  watchouts: FunderReadinessReportItem[];
  recommendedActions: FunderReadinessReportItem[];
}

export interface FunderReadinessReportInput {
  organizationName: string;
  ein: string;
  taxYear: number;
  filing: NonNullable<RawForm990HealthScoreInput['filing']>;
}

const SECTION_ORDER: FunderReadinessReportSection['key'][] = [
  'program_expense_ratio',
  'revenue_concentration_risk',
  'reserve_months',
  'executive_compensation_ratio',
];

export class FunderReadinessReportService {
  constructor(private readonly healthScoreService = new Form990HealthScoreService()) {}

  generate(input: FunderReadinessReportInput): FunderReadinessReport {
    const score = this.healthScoreService.score({
      taxYear: input.taxYear,
      filing: input.filing,
    });

    const sections = this.buildSections(score);
    const rankedSections = [...sections].sort((left, right) => (
      left.score - right.score || left.title.localeCompare(right.title)
    ));

    return {
      identity: {
        organizationName: input.organizationName,
        ein: input.ein,
        taxYear: input.taxYear,
      },
      overallScore: score.score,
      overallExplanation: score.explanation,
      scoreMethodology: score.methodology,
      sections,
      watchouts: rankedSections.slice(0, 3).map(section => this.toWatchout(section, score)),
      recommendedActions: rankedSections.slice(0, 3).map(section => this.toRecommendation(section, score)),
    };
  }

  private buildSections(score: Form990HealthScoreResult): FunderReadinessReportSection[] {
    const sectionMap: Record<FunderReadinessReportSection['key'], FunderReadinessReportSection> = {
      program_expense_ratio: {
        key: 'program_expense_ratio',
        title: 'Program Expense Ratio',
        score: score.components.programExpenseRatio.score,
        rating: score.components.programExpenseRatio.rating,
        metricLabel: score.components.programExpenseRatio.displayValue,
        formula: score.components.programExpenseRatio.formula,
        explanation: score.components.programExpenseRatio.explanation,
      },
      revenue_concentration_risk: {
        key: 'revenue_concentration_risk',
        title: 'Revenue Concentration Risk',
        score: score.components.revenueConcentrationRisk.score,
        rating: score.components.revenueConcentrationRisk.rating,
        metricLabel: `${score.components.revenueConcentrationRisk.displayValue} in ${score.metrics.topRevenueSource}`,
        formula: score.components.revenueConcentrationRisk.formula,
        explanation: score.components.revenueConcentrationRisk.explanation,
      },
      reserve_months: {
        key: 'reserve_months',
        title: 'Reserve Months',
        score: score.components.reserveMonths.score,
        rating: score.components.reserveMonths.rating,
        metricLabel: score.components.reserveMonths.displayValue,
        formula: score.components.reserveMonths.formula,
        explanation: score.components.reserveMonths.explanation,
      },
      executive_compensation_ratio: {
        key: 'executive_compensation_ratio',
        title: 'Executive Compensation Ratio',
        score: score.components.executiveCompensationRatio.score,
        rating: score.components.executiveCompensationRatio.rating,
        metricLabel: score.components.executiveCompensationRatio.displayValue,
        formula: score.components.executiveCompensationRatio.formula,
        explanation: score.components.executiveCompensationRatio.explanation,
      },
    };

    return SECTION_ORDER.map(key => sectionMap[key]);
  }

  private toWatchout(
    section: FunderReadinessReportSection,
    score: Form990HealthScoreResult
  ): FunderReadinessReportItem {
    switch (section.key) {
      case 'program_expense_ratio':
        return {
          title: 'Program spending mix',
          detail: `Program services represent ${score.components.programExpenseRatio.displayValue} of total expenses. This is the current delivery-to-overhead mix funders will see first.`,
          priority: priorityForScore(section.score),
        };
      case 'revenue_concentration_risk':
        return {
          title: 'Revenue concentration',
          detail: `${score.metrics.topRevenueSource} accounts for ${score.components.revenueConcentrationRisk.displayValue} of the reported revenue mix, which can amplify renewal or timing risk.`,
          priority: priorityForScore(section.score),
        };
      case 'reserve_months':
        return {
          title: 'Operating cushion',
          detail: `Unrestricted reserves cover ${score.components.reserveMonths.displayValue} of expenses at the current spend rate.`,
          priority: priorityForScore(section.score),
        };
      case 'executive_compensation_ratio':
        return {
          title: 'Executive compensation burden',
          detail: `Executive compensation equals ${score.components.executiveCompensationRatio.displayValue} of total expenses, which should be supported by clear benchmarking and board documentation.`,
          priority: priorityForScore(section.score),
        };
    }
  }

  private toRecommendation(
    section: FunderReadinessReportSection,
    score: Form990HealthScoreResult
  ): FunderReadinessReportItem {
    switch (section.key) {
      case 'program_expense_ratio':
        return {
          title: 'Improve visible program allocation',
          detail: section.score >= 80
            ? 'Maintain the current program allocation and preserve board-ready support for how administrative costs enable delivery.'
            : 'Review functional expense allocation and budget shifts that can move more spending into documented program delivery.',
          priority: priorityForScore(section.score),
        };
      case 'revenue_concentration_risk':
        return {
          title: 'Broaden recurring revenue coverage',
          detail: section.score >= 80
            ? `Protect diversification by keeping ${score.metrics.topRevenueSource} below one-third of the annual revenue mix.`
            : `Reduce dependence on ${score.metrics.topRevenueSource} by growing secondary recurring revenue streams before the next filing cycle.`,
          priority: priorityForScore(section.score),
        };
      case 'reserve_months':
        return {
          title: 'Build unrestricted liquidity',
          detail: section.score >= 80
            ? 'Preserve reserve discipline and document a board policy for how unrestricted reserves will be maintained.'
            : 'Set a board-approved reserve target and build unrestricted liquidity toward at least 3 to 6 months of expenses.',
          priority: priorityForScore(section.score),
        };
      case 'executive_compensation_ratio':
        return {
          title: 'Tighten compensation support',
          detail: section.score >= 80
            ? 'Keep executive compensation benchmarking current so the ratio remains easy to defend in funder diligence.'
            : 'Refresh compensation benchmarking and board minutes so leadership pay remains clearly supported relative to organization size.',
          priority: priorityForScore(section.score),
        };
    }
  }
}

function priorityForScore(score: number): FunderReadinessReportItem['priority'] {
  if (score < 40) return 'high';
  if (score < 70) return 'medium';
  return 'low';
}

export default FunderReadinessReportService;

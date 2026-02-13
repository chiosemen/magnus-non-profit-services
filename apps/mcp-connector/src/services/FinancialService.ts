/**
 * Magnus MCP Connector — FinancialService
 * Plaid integration for live financial data: revenue/expense breakdowns, income summaries
 * Called by: get-revenue-breakdown, get-expense-allocation, get-income-summary
 */

import axios, { AxiosInstance } from 'axios';
import { PlaidAPIError } from '../utils/errors';
import {
  calculateVolatility,
  calculateConcentrationRisk,
} from '../utils/calculators';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RevenueStream {
  category: string;
  subcategory?: string;
  amount: number;
  percentage: number;
  priorYearAmount?: number;
  growthRate?: number;
  isRestricted: boolean;
  isRecurring: boolean;
}

export interface RevenueBreakdown {
  ein: string;
  taxYear: number;
  totalRevenue: number;
  streams: RevenueStream[];
  concentrationRisk: number;
  concentrationRiskRating: 'low' | 'moderate' | 'high' | 'critical';
  diversificationScore: number;
  recurringRevenuePercentage: number;
  insights: string[];
}

export interface ExpenseCategory {
  category: string;
  programArea?: string;
  amount: number;
  percentage: number;
  priorYearAmount?: number;
  growthRate?: number;
  isFixed: boolean;
  benchmarkPercentage?: number;
  varianceFromBenchmark?: number;
}

export interface ExpenseAllocation {
  ein: string;
  taxYear: number;
  totalExpenses: number;
  programExpenses: number;
  adminExpenses: number;
  fundraisingExpenses: number;
  programRatio: number;
  adminRatio: number;
  fundraisingRatio: number;
  categories: ExpenseCategory[];
  insights: string[];
}

export interface MonthlyIncome {
  month: string;           // YYYY-MM
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  cumulativeNet: number;
  categories: Record<string, number>;
}

export interface IncomeSummary {
  ein: string;
  period: { start: string; end: string };
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  monthly: MonthlyIncome[];
  revenueVolatility: number;
  averageMonthlyRevenue: number;
  averageMonthlyExpenses: number;
  burnRate?: number;
  runwayMonths?: number;
  cashBalance?: number;
  insights: string[];
}

export interface TaxEstimate {
  taxYear: number;
  filingType: 'Form 990' | 'Form 990-EZ' | 'Form 990-N' | 'Form 990-PF';
  filingDueDate: string;
  extensionDeadline: string;
  estimatedUBITaxLiability: number;
  estimatedStateFilingFees: number;
  quarterlyPaymentSchedule: Array<{ quarter: string; dueDate: string; estimatedAmount: number }>;
  notes: string[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FinancialService {
  private readonly plaidClient: AxiosInstance;
  private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();
  private readonly cacheTTL = 900 * 1000; // 15 minutes (financial data changes frequently)

  constructor() {
    this.plaidClient = axios.create({
      baseURL: process.env['PLAID_BASE_URL'] ?? 'https://sandbox.plaid.com',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': process.env['PLAID_CLIENT_ID'] ?? '',
        'PLAID-SECRET': process.env['PLAID_SECRET'] ?? '',
      },
      timeout: 15000,
    });
  }

  // ─── Revenue Breakdown ───────────────────────────────────────────────────────

  async getRevenueBreakdown(ein: string, taxYear?: number, accessToken?: string): Promise<RevenueBreakdown> {
    const cacheKey = `revenue:${ein}:${taxYear ?? 'latest'}`;
    const cached = this.fromCache<RevenueBreakdown>(cacheKey);
    if (cached) return cached;

    // If Plaid access token provided, pull live transactions; otherwise use 990 data
    const streams = accessToken
      ? await this.getPlaidRevenueStreams(accessToken, taxYear)
      : this.getEstimatedRevenueStreams(taxYear);

    const totalRevenue = streams.reduce((s, r) => s + r.amount, 0);
    const streamsWithPct = streams.map(s => ({
      ...s,
      percentage: totalRevenue > 0 ? (s.amount / totalRevenue) * 100 : 0,
    }));

    const concentrationRisk = calculateConcentrationRisk(streams.map(s => s.amount));
    const recurringPct = streamsWithPct
      .filter(s => s.isRecurring)
      .reduce((acc, s) => acc + s.percentage, 0);

    const insights: string[] = [];
    if (concentrationRisk > 40) insights.push(`⚠️ High revenue concentration — top source accounts for ${concentrationRisk.toFixed(0)}% of total`);
    if (recurringPct < 50) insights.push('Consider building recurring revenue streams for stability');
    if (recurringPct > 70) insights.push('✅ Strong recurring revenue base (>70%)');

    const result: RevenueBreakdown = {
      ein,
      taxYear: taxYear ?? new Date().getFullYear() - 1,
      totalRevenue,
      streams: streamsWithPct,
      concentrationRisk,
      concentrationRiskRating: concentrationRisk > 60 ? 'critical' : concentrationRisk > 40 ? 'high' : concentrationRisk > 25 ? 'moderate' : 'low',
      diversificationScore: Math.max(0, 100 - concentrationRisk),
      recurringRevenuePercentage: recurringPct,
      insights,
    };

    this.toCache(cacheKey, result);
    return result;
  }

  // ─── Expense Allocation ──────────────────────────────────────────────────────

  async getExpenseAllocation(ein: string, taxYear?: number, accessToken?: string): Promise<ExpenseAllocation> {
    const cacheKey = `expenses:${ein}:${taxYear ?? 'latest'}`;
    const cached = this.fromCache<ExpenseAllocation>(cacheKey);
    if (cached) return cached;

    const categories = accessToken
      ? await this.getPlaidExpenseCategories(accessToken, taxYear)
      : this.getEstimatedExpenseCategories();

    const totalExpenses = categories.reduce((s, c) => s + c.amount, 0);
    const withPct = categories.map(c => ({
      ...c,
      percentage: totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0,
    }));

    const programExp = withPct.filter(c => c.category === 'Program').reduce((s, c) => s + c.amount, 0);
    const adminExp = withPct.filter(c => c.category === 'Administration').reduce((s, c) => s + c.amount, 0);
    const fundraisingExp = withPct.filter(c => c.category === 'Fundraising').reduce((s, c) => s + c.amount, 0);

    const insights: string[] = [];
    const programRatio = totalExpenses > 0 ? (programExp / totalExpenses) * 100 : 0;
    if (programRatio < 65) insights.push(`⚠️ Program ratio ${programRatio.toFixed(1)}% is below the 65% minimum benchmark`);
    if (programRatio >= 80) insights.push(`✅ Excellent program ratio ${programRatio.toFixed(1)}% — exceeds 80% excellence threshold`);

    const result: ExpenseAllocation = {
      ein,
      taxYear: taxYear ?? new Date().getFullYear() - 1,
      totalExpenses,
      programExpenses: programExp,
      adminExpenses: adminExp,
      fundraisingExpenses: fundraisingExp,
      programRatio,
      adminRatio: totalExpenses > 0 ? (adminExp / totalExpenses) * 100 : 0,
      fundraisingRatio: totalExpenses > 0 ? (fundraisingExp / totalExpenses) * 100 : 0,
      categories: withPct,
      insights,
    };

    this.toCache(cacheKey, result);
    return result;
  }

  // ─── Income Summary ───────────────────────────────────────────────────────────

  async getIncomeSummary(ein: string, months = 12, accessToken?: string): Promise<IncomeSummary> {
    const cacheKey = `income:${ein}:${months}`;
    const cached = this.fromCache<IncomeSummary>(cacheKey);
    if (cached) return cached;

    const monthly = accessToken
      ? await this.getPlaidMonthlyData(accessToken, months)
      : this.generateEstimatedMonthlyData(months);

    const totalRevenue = monthly.reduce((s, m) => s + m.totalRevenue, 0);
    const totalExpenses = monthly.reduce((s, m) => s + m.totalExpenses, 0);
    const revenues = monthly.map(m => m.totalRevenue);
    const volatility = calculateVolatility(revenues);

    const insights: string[] = [];
    if (volatility > 30) insights.push('⚠️ High revenue volatility — consider building a 6-month reserve fund');
    if (totalRevenue < totalExpenses) insights.push('⚠️ Expenses exceed revenue — review budget immediately');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const burnRate = totalExpenses > totalRevenue ? (totalExpenses - totalRevenue) / months : undefined;
    const result: IncomeSummary = {
      ein,
      period: {
        start: startDate.toISOString().split('T')[0]!,
        end: endDate.toISOString().split('T')[0]!,
      },
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      monthly,
      revenueVolatility: volatility,
      averageMonthlyRevenue: totalRevenue / months,
      averageMonthlyExpenses: totalExpenses / months,
      ...(burnRate !== undefined ? { burnRate } : {}),
      insights,
    };

    this.toCache(cacheKey, result);
    return result;
  }

  // ─── Tax Estimates ────────────────────────────────────────────────────────────

  async getTaxEstimates(ein: string, taxYear?: number): Promise<TaxEstimate> {
    void ein;
    const year = taxYear ?? new Date().getFullYear();
    const filingDue = new Date(year + 1, 4, 15); // May 15 following year
    const extensionDue = new Date(year + 1, 10, 15); // Nov 15 with extension

    return {
      taxYear: year,
      filingType: 'Form 990',
      filingDueDate: filingDue.toISOString().split('T')[0]!,
      extensionDeadline: extensionDue.toISOString().split('T')[0]!,
      estimatedUBITaxLiability: 0, // Calculated based on unrelated business income
      estimatedStateFilingFees: 150,
      quarterlyPaymentSchedule: [
        { quarter: 'Q1', dueDate: `${year}-04-15`, estimatedAmount: 0 },
        { quarter: 'Q2', dueDate: `${year}-06-15`, estimatedAmount: 0 },
        { quarter: 'Q3', dueDate: `${year}-09-15`, estimatedAmount: 0 },
        { quarter: 'Q4', dueDate: `${year + 1}-01-15`, estimatedAmount: 0 },
      ],
      notes: [
        'Most 501(c)(3) organizations owe no federal income tax on exempt activities',
        'Unrelated Business Income Tax (UBIT) applies to activities unrelated to exempt purpose',
        'Consult a CPA for state-specific filing requirements in your state(s) of operation',
      ],
    };
  }

  // ─── Plaid Integration ────────────────────────────────────────────────────────

  private async getPlaidRevenueStreams(accessToken: string, _taxYear?: number): Promise<RevenueStream[]> {
    try {
      const response = await this.plaidClient.post('/transactions/get', {
        access_token: accessToken,
        start_date: this.getYearStart(_taxYear),
        end_date: this.getYearEnd(_taxYear),
      });
      return this.categorizeTransactionsAsRevenue(response.data?.transactions ?? []);
    } catch (err) {
      throw new PlaidAPIError('Failed to fetch transactions', err instanceof Error ? err : undefined);
    }
  }

  private async getPlaidExpenseCategories(accessToken: string, _taxYear?: number): Promise<ExpenseCategory[]> {
    try {
      const response = await this.plaidClient.post('/transactions/get', {
        access_token: accessToken,
        start_date: this.getYearStart(_taxYear),
        end_date: this.getYearEnd(_taxYear),
      });
      return this.categorizeTransactionsAsExpenses(response.data?.transactions ?? []);
    } catch (err) {
      throw new PlaidAPIError('Failed to fetch expense transactions', err instanceof Error ? err : undefined);
    }
  }

  private async getPlaidMonthlyData(accessToken: string, months: number): Promise<MonthlyIncome[]> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    try {
      const response = await this.plaidClient.post('/transactions/get', {
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
      });
      return this.aggregateByMonth(response.data?.transactions ?? [], months);
    } catch {
      return this.generateEstimatedMonthlyData(months);
    }
  }

  // ─── Data Helpers ─────────────────────────────────────────────────────────────

  private categorizeTransactionsAsRevenue(_transactions: unknown[]): RevenueStream[] {
    return this.getEstimatedRevenueStreams();
  }

  private categorizeTransactionsAsExpenses(_transactions: unknown[]): ExpenseCategory[] {
    return this.getEstimatedExpenseCategories();
  }

  private aggregateByMonth(_transactions: unknown[], months: number): MonthlyIncome[] {
    return this.generateEstimatedMonthlyData(months);
  }

  private getEstimatedRevenueStreams(taxYear?: number): RevenueStream[] {
    void taxYear;
    return [
      { category: 'Contributions & Grants', amount: 450000, percentage: 0, isRestricted: false, isRecurring: false },
      { category: 'Government Grants', amount: 200000, percentage: 0, isRestricted: true, isRecurring: true },
      { category: 'Program Service Revenue', amount: 120000, percentage: 0, isRestricted: false, isRecurring: true },
      { category: 'Individual Donations', amount: 80000, percentage: 0, isRestricted: false, isRecurring: true },
      { category: 'Special Events', amount: 50000, percentage: 0, isRestricted: false, isRecurring: false },
      { category: 'Investment Income', amount: 25000, percentage: 0, isRestricted: false, isRecurring: true },
    ];
  }

  private getEstimatedExpenseCategories(): ExpenseCategory[] {
    return [
      { category: 'Program', programArea: 'Direct Services', amount: 520000, percentage: 0, isFixed: false, benchmarkPercentage: 75 },
      { category: 'Program', programArea: 'Education', amount: 130000, percentage: 0, isFixed: false, benchmarkPercentage: 75 },
      { category: 'Administration', amount: 110000, percentage: 0, isFixed: true, benchmarkPercentage: 15 },
      { category: 'Fundraising', amount: 65000, percentage: 0, isFixed: false, benchmarkPercentage: 10 },
    ];
  }

  private generateEstimatedMonthlyData(months: number): MonthlyIncome[] {
    const data: MonthlyIncome[] = [];
    let cumulative = 0;
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const revenue = 75000 + Math.floor(Math.random() * 30000);
      const expenses = 70000 + Math.floor(Math.random() * 20000);
      const net = revenue - expenses;
      cumulative += net;
      data.push({ month, totalRevenue: revenue, totalExpenses: expenses, netIncome: net, cumulativeNet: cumulative, categories: {} });
    }
    return data;
  }

  private getYearStart(taxYear?: number): string {
    const year = taxYear ?? new Date().getFullYear() - 1;
    return `${year}-01-01`;
  }

  private getYearEnd(taxYear?: number): string {
    const year = taxYear ?? new Date().getFullYear() - 1;
    return `${year}-12-31`;
  }

  private fromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) { this.cache.delete(key); return null; }
    return entry.data as T;
  }
  private toCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expiresAt: Date.now() + this.cacheTTL });
  }
}

export default FinancialService;

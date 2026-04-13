/**
 * Magnus MCP Connector — FinancialService
 * Plaid integration for live financial data: revenue/expense breakdowns, income summaries
 * Called by: get-revenue-breakdown, get-expense-allocation, get-income-summary
 *
 * PRODUCTION CONTRACT:
 * - Never return fabricated, estimated, or Math.random() financial values.
 * - If Plaid access token is absent → throw DataSourceNotConfiguredError (503).
 * - If Plaid call fails → throw PlaidAPIError (propagate, do not fall back to estimates).
 * - Tools layer is responsible for translating these errors into structured 503 responses.
 */

import axios, { AxiosInstance } from 'axios';
import { PlaidAPIError } from '../utils/errors';
import {
  calculateVolatility,
  calculateConcentrationRisk,
} from '../utils/calculators';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class DataSourceNotConfiguredError extends Error {
  readonly code = 'DATA_SOURCE_NOT_CONFIGURED';
  constructor(source: string) {
    super(
      `Financial data source not configured: ${source}. ` +
      `Complete Plaid onboarding to enable live financial data.`
    );
    this.name = 'DataSourceNotConfiguredError';
  }
}

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
  dataSource: 'plaid_live';
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
  dataSource: 'plaid_live';
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
  dataSource: 'plaid_live';
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
  dataSource: 'statutory_deadlines';
}

// ─── Plaid transaction shape (minimal) ───────────────────────────────────────

interface PlaidTransaction {
  amount: number;          // Positive = debit, negative = credit in Plaid convention
  date: string;            // YYYY-MM-DD
  category?: string[];
  name: string;
  pending: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FinancialService {
  private readonly plaidClient: AxiosInstance;
  private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();
  private readonly cacheTTL = 900 * 1000; // 15 minutes

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
    if (!accessToken) {
      throw new DataSourceNotConfiguredError('Plaid (revenue breakdown)');
    }

    const cacheKey = `revenue:${ein}:${taxYear ?? 'latest'}`;
    const cached = this.fromCache<RevenueBreakdown>(cacheKey);
    if (cached) return cached;

    const streams = await this.getPlaidRevenueStreams(accessToken, taxYear);

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
      dataSource: 'plaid_live',
    };

    this.toCache(cacheKey, result);
    return result;
  }

  // ─── Expense Allocation ──────────────────────────────────────────────────────

  async getExpenseAllocation(ein: string, taxYear?: number, accessToken?: string): Promise<ExpenseAllocation> {
    if (!accessToken) {
      throw new DataSourceNotConfiguredError('Plaid (expense allocation)');
    }

    const cacheKey = `expenses:${ein}:${taxYear ?? 'latest'}`;
    const cached = this.fromCache<ExpenseAllocation>(cacheKey);
    if (cached) return cached;

    const categories = await this.getPlaidExpenseCategories(accessToken, taxYear);

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
      dataSource: 'plaid_live',
    };

    this.toCache(cacheKey, result);
    return result;
  }

  // ─── Income Summary ───────────────────────────────────────────────────────────

  async getIncomeSummary(ein: string, months = 12, accessToken?: string): Promise<IncomeSummary> {
    if (!accessToken) {
      throw new DataSourceNotConfiguredError('Plaid (income summary)');
    }

    const cacheKey = `income:${ein}:${months}`;
    const cached = this.fromCache<IncomeSummary>(cacheKey);
    if (cached) return cached;

    const monthly = await this.getPlaidMonthlyData(accessToken, months);

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
      dataSource: 'plaid_live',
    };

    this.toCache(cacheKey, result);
    return result;
  }

  // ─── Tax Estimates ────────────────────────────────────────────────────────────
  // NOTE: Tax deadlines are statutory fact, not fabricated — this method is safe.
  // estimatedUBITaxLiability is 0 because we cannot compute UBIT without real data;
  // the output notes say "consult a CPA" and the field label reflects this.

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
      estimatedUBITaxLiability: 0, // Cannot compute without real UBIT revenue data; see notes
      estimatedStateFilingFees: 150, // Statutory minimum estimate; varies by state
      quarterlyPaymentSchedule: [
        { quarter: 'Q1', dueDate: `${year}-04-15`, estimatedAmount: 0 },
        { quarter: 'Q2', dueDate: `${year}-06-15`, estimatedAmount: 0 },
        { quarter: 'Q3', dueDate: `${year}-09-15`, estimatedAmount: 0 },
        { quarter: 'Q4', dueDate: `${year + 1}-01-15`, estimatedAmount: 0 },
      ],
      notes: [
        'Most 501(c)(3) organizations owe no federal income tax on exempt activities',
        'Unrelated Business Income Tax (UBIT) applies to activities unrelated to exempt purpose',
        'UBIT liability shown as 0 — connect Plaid to compute actual UBIT from transaction data',
        'Consult a CPA for state-specific filing requirements in your state(s) of operation',
        'State filing fee estimate ($150) is a general minimum; actual fees vary by state and total revenue',
      ],
      dataSource: 'statutory_deadlines',
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
      const transactions: PlaidTransaction[] = response.data?.transactions ?? [];
      return this.categorizeTransactionsAsRevenue(transactions);
    } catch (err) {
      throw new PlaidAPIError('Failed to fetch revenue transactions from Plaid', err instanceof Error ? err : undefined);
    }
  }

  private async getPlaidExpenseCategories(accessToken: string, _taxYear?: number): Promise<ExpenseCategory[]> {
    try {
      const response = await this.plaidClient.post('/transactions/get', {
        access_token: accessToken,
        start_date: this.getYearStart(_taxYear),
        end_date: this.getYearEnd(_taxYear),
      });
      const transactions: PlaidTransaction[] = response.data?.transactions ?? [];
      return this.categorizeTransactionsAsExpenses(transactions);
    } catch (err) {
      throw new PlaidAPIError('Failed to fetch expense transactions from Plaid', err instanceof Error ? err : undefined);
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
      const transactions: PlaidTransaction[] = response.data?.transactions ?? [];
      return this.aggregateByMonth(transactions, months);
    } catch (err) {
      // Do NOT fall back to synthetic estimates — propagate the real error.
      throw new PlaidAPIError('Failed to fetch monthly transaction data from Plaid', err instanceof Error ? err : undefined);
    }
  }

  // ─── Real Transaction Transformers ───────────────────────────────────────────
  // These implement minimal real categorization logic.
  // Plaid: positive amount = debit (expense), negative = credit (not applicable here).
  // For nonprofits, credits to the account (deposits) = revenue.

  private categorizeTransactionsAsRevenue(transactions: PlaidTransaction[]): RevenueStream[] {
    // In Plaid, negative amount = money coming IN to the account (deposit/credit)
    const revenues = transactions.filter(t => !t.pending && t.amount < 0);
    if (revenues.length === 0) {
      return [];
    }

    const categoryMap = new Map<string, number>();
    for (const txn of revenues) {
      const cat = txn.category?.[0] ?? 'Uncategorized';
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + Math.abs(txn.amount));
    }

    return Array.from(categoryMap.entries()).map(([category, amount]) => ({
      category,
      amount,
      percentage: 0, // Caller computes after aggregation
      isRestricted: false, // Cannot determine from Plaid alone; requires org input
      isRecurring: false,  // Cannot determine from Plaid alone; requires pattern analysis
    }));
  }

  private categorizeTransactionsAsExpenses(transactions: PlaidTransaction[]): ExpenseCategory[] {
    // Positive amount = debit (expense)
    const expenses = transactions.filter(t => !t.pending && t.amount > 0);
    if (expenses.length === 0) {
      return [];
    }

    const categoryMap = new Map<string, number>();
    for (const txn of expenses) {
      const cat = txn.category?.[0] ?? 'Uncategorized';
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + txn.amount);
    }

    return Array.from(categoryMap.entries()).map(([category, amount]) => ({
      category: this.mapPlaidCategoryToFunctional(category),
      programArea: category,
      amount,
      percentage: 0, // Caller computes
      isFixed: false, // Cannot determine without org input
    }));
  }

  private aggregateByMonth(transactions: PlaidTransaction[], months: number): MonthlyIncome[] {
    // Build month buckets for the last N months
    const buckets = new Map<string, { revenue: number; expenses: number; categories: Record<string, number> }>();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, { revenue: 0, expenses: 0, categories: {} });
    }

    for (const txn of transactions) {
      if (txn.pending) continue;
      const monthKey = txn.date.substring(0, 7);
      const bucket = buckets.get(monthKey);
      if (!bucket) continue;

      if (txn.amount < 0) {
        bucket.revenue += Math.abs(txn.amount);
      } else {
        bucket.expenses += txn.amount;
        const cat = txn.category?.[0] ?? 'Uncategorized';
        bucket.categories[cat] = (bucket.categories[cat] ?? 0) + txn.amount;
      }
    }

    const result: MonthlyIncome[] = [];
    let cumulative = 0;
    for (const [month, { revenue, expenses, categories }] of buckets) {
      const net = revenue - expenses;
      cumulative += net;
      result.push({ month, totalRevenue: revenue, totalExpenses: expenses, netIncome: net, cumulativeNet: cumulative, categories });
    }
    return result;
  }

  // ─── Category Mapping ─────────────────────────────────────────────────────────

  private mapPlaidCategoryToFunctional(plaidCategory: string): string {
    const lower = plaidCategory.toLowerCase();
    if (lower.includes('payroll') || lower.includes('salary') || lower.includes('wages')) return 'Administration';
    if (lower.includes('fundrais') || lower.includes('event') || lower.includes('marketing')) return 'Fundraising';
    return 'Program';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Magnus MCP Connector — WorkerService
 * Multi-org worker profiles, cross-org analytics, payroll data
 * Called by: get-multi-org-profile, get-income-summary, get-tax-estimates
 */

import { NotFoundError } from '../utils/errors';
import { formatCurrency } from '../utils/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgProfile {
  ein: string;
  orgName: string;
  city: string;
  state: string;
  nteeCode: string;
  taxYear: number;
  totalRevenue: number;
  totalExpenses: number;
  netAssets: number;
  employeeCount: number;
  volunteerCount: number;
  programRatio: number;
  filingStatus: 'current' | 'overdue' | 'pending';
  healthScore: number;
  lastSynced: Date;
}

export interface MultiOrgProfile {
  userId: string;
  organizations: OrgProfile[];
  totalRevenue: number;
  totalNetAssets: number;
  totalEmployees: number;
  combinedHealthScore: number;
  orgCount: number;
  alerts: Array<{ ein: string; orgName: string; severity: string; message: string }>;
  comparisonMetrics: OrgComparison[];
  lastUpdated: Date;
}

export interface OrgComparison {
  metric: string;
  values: Array<{ ein: string; orgName: string; value: number; formatted: string }>;
  bestEIN: string;
  insight: string;
}

export interface WorkerPayrollSummary {
  orgId: string;
  taxYear: number;
  totalPayroll: number;
  employeeCount: number;
  averageSalary: number;
  highestCompensation: number;
  benefitsExpense: number;
  payrollTaxLiability: number;
  quarterlyPayroll: Array<{ quarter: string; amount: number }>;
  topEarners: Array<{ title: string; compensation: number; isOfficer: boolean }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class WorkerService {
  // In production these come from Prisma / DB; using in-memory store for dev
  private orgRegistry = new Map<string, OrgProfile[]>(); // userId → orgs

  async getMultiOrgProfile(userId: string, eins?: string[]): Promise<MultiOrgProfile> {
    const orgs = await this.getOrgsForUser(userId, eins);
    if (!orgs.length) {
      throw new NotFoundError('Organizations', userId, {
        reason: 'No organizations found for this user. Add organizations via the dashboard.',
      });
    }

    const totalRevenue = orgs.reduce((s, o) => s + o.totalRevenue, 0);
    const totalNetAssets = orgs.reduce((s, o) => s + o.netAssets, 0);
    const totalEmployees = orgs.reduce((s, o) => s + o.employeeCount, 0);
    const combinedHealthScore = Math.round(
      orgs.reduce((s, o) => s + o.healthScore, 0) / orgs.length
    );

    const alerts = orgs
      .filter(o => o.filingStatus === 'overdue')
      .map(o => ({
        ein: o.ein,
        orgName: o.orgName,
        severity: 'critical',
        message: `Form 990 filing is overdue for ${o.orgName}`,
      }));

    const comparisonMetrics = this.buildComparisonMetrics(orgs);

    return {
      userId,
      organizations: orgs,
      totalRevenue,
      totalNetAssets,
      totalEmployees,
      combinedHealthScore,
      orgCount: orgs.length,
      alerts,
      comparisonMetrics,
      lastUpdated: new Date(),
    };
  }

  async getPayrollSummary(ein: string, taxYear?: number): Promise<WorkerPayrollSummary> {
    const year = taxYear ?? new Date().getFullYear() - 1;
    // In production: pull from Plaid payroll integration or manual upload
    return {
      orgId: ein,
      taxYear: year,
      totalPayroll: 420000,
      employeeCount: 12,
      averageSalary: 35000,
      highestCompensation: 95000,
      benefitsExpense: 63000,
      payrollTaxLiability: 32130,
      quarterlyPayroll: [
        { quarter: 'Q1', amount: 105000 },
        { quarter: 'Q2', amount: 105000 },
        { quarter: 'Q3', amount: 105000 },
        { quarter: 'Q4', amount: 105000 },
      ],
      topEarners: [
        { title: 'Executive Director', compensation: 95000, isOfficer: true },
        { title: 'Program Director', compensation: 72000, isOfficer: false },
        { title: 'Development Director', compensation: 68000, isOfficer: false },
      ],
    };
  }

  async registerOrg(userId: string, org: OrgProfile): Promise<void> {
    const existing = this.orgRegistry.get(userId) ?? [];
    const idx = existing.findIndex(o => o.ein === org.ein);
    if (idx >= 0) {
      existing[idx] = org;
    } else {
      existing.push(org);
    }
    this.orgRegistry.set(userId, existing);
  }

  async removeOrg(userId: string, ein: string): Promise<void> {
    const existing = this.orgRegistry.get(userId) ?? [];
    this.orgRegistry.set(userId, existing.filter(o => o.ein !== ein));
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async getOrgsForUser(userId: string, filterEINs?: string[]): Promise<OrgProfile[]> {
    let orgs = this.orgRegistry.get(userId) ?? this.getSeedOrgs(userId);
    if (filterEINs?.length) {
      orgs = orgs.filter(o => filterEINs.includes(o.ein));
    }
    return orgs;
  }

  private buildComparisonMetrics(orgs: OrgProfile[]): OrgComparison[] {
    if (orgs.length < 2) return [];

    const metrics: OrgComparison[] = [
      {
        metric: 'Program Ratio',
        values: orgs.map(o => ({
          ein: o.ein,
          orgName: o.orgName,
          value: o.programRatio,
          formatted: `${o.programRatio.toFixed(1)}%`,
        })),
        bestEIN: orgs.reduce((best, o) => o.programRatio > (orgs.find(x => x.ein === best)?.programRatio ?? 0) ? o.ein : best, orgs[0]?.ein ?? ''),
        insight: 'Higher program ratio indicates more spending on mission activities',
      },
      {
        metric: 'Financial Health Score',
        values: orgs.map(o => ({
          ein: o.ein,
          orgName: o.orgName,
          value: o.healthScore,
          formatted: `${o.healthScore}/100`,
        })),
        bestEIN: orgs.reduce((best, o) => o.healthScore > (orgs.find(x => x.ein === best)?.healthScore ?? 0) ? o.ein : best, orgs[0]?.ein ?? ''),
        insight: 'Composite score based on ratios, reserves, and revenue stability',
      },
      {
        metric: 'Total Revenue',
        values: orgs.map(o => ({
          ein: o.ein,
          orgName: o.orgName,
          value: o.totalRevenue,
          formatted: formatCurrency(o.totalRevenue),
        })),
        bestEIN: orgs.reduce((best, o) => o.totalRevenue > (orgs.find(x => x.ein === best)?.totalRevenue ?? 0) ? o.ein : best, orgs[0]?.ein ?? ''),
        insight: 'Raw revenue size across organizations',
      },
    ];

    return metrics;
  }

  private getSeedOrgs(userId: string): OrgProfile[] {
    void userId;
    return [
      {
        ein: '12-3456789',
        orgName: 'Community Health Initiative',
        city: 'Los Angeles',
        state: 'CA',
        nteeCode: 'E20',
        taxYear: 2023,
        totalRevenue: 925000,
        totalExpenses: 878000,
        netAssets: 312000,
        employeeCount: 15,
        volunteerCount: 42,
        programRatio: 78.4,
        filingStatus: 'current',
        healthScore: 74,
        lastSynced: new Date(),
      },
    ];
  }
}

export default WorkerService;

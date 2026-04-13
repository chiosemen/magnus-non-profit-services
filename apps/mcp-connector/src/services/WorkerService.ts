/**
 * Magnus MCP Connector — WorkerService
 * Multi-org worker profiles, cross-org analytics, payroll data
 * Called by: get-multi-org-profile, get-income-summary, get-tax-estimates
 *
 * PRODUCTION CONTRACT:
 * - getMultiOrgProfile MUST NOT fall back to hardcoded seed org data for unknown users.
 *   If no orgs are registered for a user, throw NotFoundError (fail closed).
 * - getPayrollSummary MUST NOT return hardcoded payroll figures.
 *   Until real payroll data (Plaid payroll, manual upload) is wired, throw
 *   PayrollDataUnavailableError with FEATURE_NOT_CONFIGURED.
 * - getSeedOrgs has been DELETED — do not re-add it.
 * - The in-memory orgRegistry is preserved for worker registration during the current
 *   MCP session (write-through pattern). It does NOT populate with fake data on miss.
 *
 * Activation path for getPayrollSummary:
 *  1. Integrate payroll data source (Plaid payroll, Gusto, manual upload).
 *  2. Set FEATURE_FLAG_WORKER_PAYROLL=true.
 *  3. Replace the not-configured guard with real calculation logic.
 */

import { NotFoundError } from '../utils/errors';
import { formatCurrency } from '../utils/formatters';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class PayrollDataUnavailableError extends Error {
  readonly code = 'FEATURE_NOT_CONFIGURED';
  constructor() {
    super(
      'Worker payroll data is not available. A live payroll data integration ' +
      '(Plaid payroll, Gusto, or manual upload) must be configured before ' +
      'payroll summaries can be returned. Do not use hardcoded figures.'
    );
    this.name = 'PayrollDataUnavailableError';
  }
}

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

import { prisma } from '@magnus/db';

export class WorkerService {
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

  /**
   * Returns real payroll summary data from a configured payroll provider.
   * Throws PayrollDataUnavailableError if no provider is configured.
   *
   * PRODUCTION CONTRACT: Never return hardcoded payroll figures.
   */
  async getPayrollSummary(_ein: string, _taxYear?: number): Promise<WorkerPayrollSummary> {
    throw new PayrollDataUnavailableError();
  }

  async registerOrg(userId: string, org: OrgProfile): Promise<void> {
    // This previously populated the cache. 
    // In production, relationships are created via the dashboard explicitly.
    // Given the MCP runs read-models locally, we shouldn't allow the MCP to arbitrarily 
    // manufacture full org profile definitions.
    throw new Error('Org mapping via MCP execution is prohibited. Configure via UI.');
  }

  async removeOrg(userId: string, ein: string): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { ein }
    });
    if (!org) return;
    
    await prisma.workerOrgRelationship.deleteMany({
      where: { workerId: userId, orgId: org.id }
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async getOrgsForUser(userId: string, filterEINs?: string[]): Promise<OrgProfile[]> {
    // Queries Prisma securely and deterministically
    const relationships = await prisma.workerOrgRelationship.findMany({
       where: { workerId: userId },
       include: {
         organization: true
       }
    });

    const mappedOrgs: OrgProfile[] = relationships.map(rel => {
      const dbOrg = rel.organization;
      return {
         ein: dbOrg.ein,
         orgName: dbOrg.name,
         city: 'Unknown', // Not tracked in Organization table
         state: 'Unknown', // Not tracked in Organization table 
         nteeCode: 'Unspecified',
         taxYear: new Date().getFullYear(),
         totalRevenue: dbOrg.annualRevenue ? Number(dbOrg.annualRevenue) : 0,
         totalExpenses: 0, // Explicit zero uncalculated domain metrics
         netAssets: 0,
         employeeCount: 0,
         volunteerCount: 0,
         programRatio: 0,
         filingStatus: 'unknown' as any, // Not verified natively
         healthScore: 50,
         lastSynced: dbOrg.updatedAt,
      };
    });

    if (filterEINs?.length) {
       return mappedOrgs.filter(o => filterEINs.includes(o.ein));
    }
    
    return mappedOrgs;
  }

  private buildComparisonMetrics(orgs: OrgProfile[]): OrgComparison[] {
    if (orgs.length < 2) return [];

    const metrics: OrgComparison[] = [
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

}

export default WorkerService;

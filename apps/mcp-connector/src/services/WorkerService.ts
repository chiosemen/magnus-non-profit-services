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
// P0-4 (SPEC-P0 R4): profile shapes and the pure mapping live in
// workerProfileMapper.ts — unavailable fields are null with provenance,
// never fabricated placeholders.

export type {
  OrgProfile,
  OrgProfileProvenance,
  MultiOrgProfile,
  MultiOrgProfileProvenance,
  OrgComparison,
} from './workerProfileMapper';

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
import {
  aggregateMultiOrgProfile,
  mapOrgRelationsToProfiles,
  type MultiOrgProfile,
  type OrgProfile,
} from './workerProfileMapper';

export class WorkerService {
  async getMultiOrgProfile(userId: string, eins?: string[]): Promise<MultiOrgProfile> {
    const orgs = await this.getOrgsForUser(userId, eins);
    if (!orgs.length) {
      throw new NotFoundError('Organizations', userId, {
        reason: 'No organizations found for this user. Add organizations via the dashboard.',
      });
    }

    return aggregateMultiOrgProfile({ userId, orgs, formatCurrency });
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

  async registerOrg(_userId: string, _org: OrgProfile): Promise<void> {
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
    let relationships: any[] = [];
    try {
      // Queries Prisma securely and deterministically
      relationships = await prisma.workerOrgRelationship.findMany({
         where: { workerId: userId },
         include: {
           organization: true
         }
      });
    } catch (error: any) {
      // If PostgreSQL throws a UUID format error (Prisma P2023 or database error)
      // we treat it as no organization relationships found.
      if (error.code === 'P2023' || error.message?.includes('UUID')) {
        relationships = [];
      } else {
        throw error;
      }
    }

    // P0-4 (R4): the mapper emits null + provenance for every field the
    // Organization table does not track — no 'Unknown' strings, no zero
    // stand-ins, no synthetic health scores.
    const mappedOrgs = mapOrgRelationsToProfiles(relationships);

    if (filterEINs?.length) {
       return mappedOrgs.filter(o => filterEINs.includes(o.ein));
    }

    return mappedOrgs;
  }

}

export default WorkerService;

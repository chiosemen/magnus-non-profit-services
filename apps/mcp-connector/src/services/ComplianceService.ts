/**
 * Magnus MCP Connector — ComplianceService
 * Core compliance logic: 990 data, filing history, state registrations, status
 * Called by: get-990-data, check-compliance-status, get-filing-history, get-state-registrations
 *
 * PRODUCTION CONTRACT:
 * - getStateRegistrations and getComplianceStatus.stateRegistrations must NEVER
 *   return hardcoded or mock registrations.
 * - If a real state registration data source is unavailable, return an explicit
 *   DATA_SOURCE_NOT_CONFIGURED response. Do not return fake CA/NY registrations for all orgs.
 * - ProPublica / IRS 990 paths are real external calls and are safe to use.
 * - getMockStateRegistrations has been DELETED — it must not be re-added.
 */

import axios, { AxiosInstance } from 'axios';
import {
  IRSDataError,
  OrganizationNotFoundError,
} from '../utils/errors';
import {
  calculateProgramRatio,
  calculateAdminRatio,
  calculateFundraisingROI,
  calculateMonthsOfReserves,
  calculateFinancialHealthScore,
} from '../utils/calculators';
import { formatEIN } from '../utils/formatters';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class StateRegistrationDataUnavailableError extends Error {
  readonly code = 'DATA_SOURCE_NOT_CONFIGURED';
  constructor() {
    super(
      'State charitable registration data is not available. ' +
      'A live integration with a state registration data provider (e.g. Harbor Compliance, ' +
      'CT Corp, or state-specific APIs) must be configured before this data can be returned. ' +
      'Do not use mock registrations as a substitute.'
    );
    this.name = 'StateRegistrationDataUnavailableError';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Form990Data {
  ein: string;
  orgName: string;
  taxYear: number;
  totalRevenue: number;
  totalExpenses: number;
  programServiceRevenue: number;
  contributionsGrants: number;
  programExpenses: number;
  adminExpenses: number;
  fundraisingExpenses: number;
  netAssets: number;
  totalAssets: number;
  totalLiabilities: number;
  employeeCount: number;
  volunteerCount: number;
  missionStatement: string;
  nteeCode: string;
  filingDate: string;
  taxPeriodEnd: string;
  pdfUrl?: string;
}

export interface ComplianceStatus {
  ein: string;
  orgName: string;
  taxExemptStatus: 'active' | 'revoked' | 'unknown';
  irsStatusDate: string;
  nextFilingDue: Date;
  filingStatus: 'current' | 'overdue' | 'pending' | 'unknown';
  daysUntilDue: number;
  isAtRisk: boolean;
  alerts: ComplianceAlert[];
  stateRegistrations: StateRegistration[] | null;
  stateRegistrationsNote: string | null;
  lastUpdated: Date;
}

export interface ComplianceAlert {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  dueDate?: string;
  actionRequired: string;
}

export interface FilingRecord {
  taxYear: number;
  formType: '990' | '990-EZ' | '990-N' | '990-PF';
  filingDate: string;
  taxPeriodBegin: string;
  taxPeriodEnd: string;
  totalRevenue: number;
  totalExpenses: number;
  netAssets: number;
  pdfUrl?: string;
  isAmended: boolean;
}

export interface StateRegistration {
  state: string;
  stateCode: string;
  registrationNumber?: string;
  status: 'active' | 'expired' | 'pending' | 'not_registered';
  expirationDate?: string;
  renewalDueDate?: string;
  annualReportRequired: boolean;
  charitableSolicitationRequired: boolean;
}

export interface FinancialRatios {
  ein: string;
  taxYear: number;
  programRatio: number;
  adminRatio: number;
  fundraisingRatio: number;
  fundraisingROI: number;
  monthsOfReserves: number;
  currentRatio: number;
  netMargin: number;
  revenueGrowth: number;
  healthScore: number;
  benchmarks: RatioBenchmarks;
}

export interface RatioBenchmarks {
  programRatioGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  reservesGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  overallRating: 'excellent' | 'good' | 'adequate' | 'poor';
  narrative: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComplianceService {
  private readonly propublicaClient: AxiosInstance;
  private readonly irsClient: AxiosInstance;
  private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();
  private readonly cacheTTL = 3600 * 1000; // 1 hour

  constructor() {
    this.propublicaClient = axios.create({
      baseURL: process.env['PROPUBLICA_BASE_URL'] ?? 'https://projects.propublica.org/nonprofits/api/v2',
      headers: { 'Accept': 'application/json' },
      timeout: 10000,
    });

    this.irsClient = axios.create({
      baseURL: process.env['IRS_TEOS_BASE_URL'] ?? 'https://apps.irs.gov/pub/epostcard/data-download',
      timeout: 15000,
    });
    void this.irsClient;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getForm990Data(ein: string, taxYear?: number): Promise<Form990Data> {
    const cleanEIN = this.cleanEIN(ein);
    const cacheKey = `990:${cleanEIN}:${taxYear ?? 'latest'}`;
    const cached = this.fromCache<Form990Data>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.propublicaClient.get(`/organizations/${cleanEIN}.json`);
      const org = response.data?.organization;
      if (!org) throw new OrganizationNotFoundError(cleanEIN);

      const filings: Form990Data[] = (response.data?.filings_with_data ?? []).map(
        (f: Record<string, unknown>) => this.mapFiling(cleanEIN, org, f)
      );

      if (!filings.length) throw new IRSDataError(cleanEIN, 'No 990 filings found with data');

      const filing = taxYear
        ? filings.find(f => f.taxYear === taxYear) ?? filings[0]
        : filings[0];

      if (!filing) throw new IRSDataError(cleanEIN, `No filing found for tax year ${taxYear}`);

      this.toCache(cacheKey, filing);
      return filing;
    } catch (err) {
      if (err instanceof IRSDataError || err instanceof OrganizationNotFoundError) throw err;
      throw new IRSDataError(cleanEIN, 'Failed to fetch 990 data', err instanceof Error ? err : undefined);
    }
  }

  async getFilingHistory(ein: string, yearsBack = 5): Promise<FilingRecord[]> {
    const cleanEIN = this.cleanEIN(ein);
    const cacheKey = `history:${cleanEIN}:${yearsBack}`;
    const cached = this.fromCache<FilingRecord[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.propublicaClient.get(`/organizations/${cleanEIN}.json`);
      const filings = response.data?.filings_with_data ?? [];
      const currentYear = new Date().getFullYear();
      const cutoffYear = currentYear - yearsBack;

      const history: FilingRecord[] = filings
        .filter((f: Record<string, unknown>) => {
          const year = parseInt(String(f['tax_prd_yr'] ?? 0), 10);
          return year >= cutoffYear;
        })
        .map((f: Record<string, unknown>): FilingRecord => {
          const pdfUrlRaw = f['pdf_url'];
          return {
            taxYear: parseInt(String(f['tax_prd_yr'] ?? 0), 10),
            formType: this.inferFormType(f),
            filingDate: String(f['updated'] ?? ''),
            taxPeriodBegin: String(f['tax_prd'] ?? '').slice(0, 4) + '-01-01',
            taxPeriodEnd: String(f['tax_prd'] ?? ''),
            totalRevenue: parseInt(String(f['totrevenue'] ?? 0), 10),
            totalExpenses: parseInt(String(f['totfuncexpns'] ?? 0), 10),
            netAssets: parseInt(String(f['totnetassetsend'] ?? 0), 10),
            ...(pdfUrlRaw ? { pdfUrl: String(pdfUrlRaw) } : {}),
            isAmended: String(f['amended_return_ind'] ?? '') === 'X',
          };
        })
        .sort((a: FilingRecord, b: FilingRecord) => b.taxYear - a.taxYear);

      this.toCache(cacheKey, history);
      return history;
    } catch (err) {
      throw new IRSDataError(cleanEIN, 'Failed to fetch filing history', err instanceof Error ? err : undefined);
    }
  }

  async getComplianceStatus(ein: string): Promise<ComplianceStatus> {
    const cleanEIN = this.cleanEIN(ein);

    const [form990, response] = await Promise.all([
      this.getForm990Data(cleanEIN).catch(() => null),
      this.propublicaClient.get(`/organizations/${cleanEIN}.json`).catch(() => null),
    ]);

    const org = response?.data?.organization;
    if (!org) throw new OrganizationNotFoundError(cleanEIN);

    const alerts: ComplianceAlert[] = [];
    const nextFilingDue = this.calculateNextFilingDue(form990?.taxPeriodEnd);
    const daysUntilDue = Math.floor((nextFilingDue.getTime() - Date.now()) / 86400000);

    if (daysUntilDue < 0) {
      alerts.push({
        severity: 'critical',
        code: 'FILING_OVERDUE',
        message: `Form 990 is ${Math.abs(daysUntilDue)} days overdue`,
        dueDate: nextFilingDue.toISOString().split('T')[0]!,
        actionRequired: 'File Form 990 immediately or request extension via Form 8868',
      });
    } else if (daysUntilDue < 30) {
      alerts.push({
        severity: 'warning',
        code: 'FILING_DUE_SOON',
        message: `Form 990 due in ${daysUntilDue} days`,
        dueDate: nextFilingDue.toISOString().split('T')[0]!,
        actionRequired: 'Begin 990 preparation or file Form 8868 extension',
      });
    }

    if (form990) {
      const programRatio = calculateProgramRatio(form990.programExpenses, form990.totalExpenses);
      if (programRatio < 65) {
        alerts.push({
          severity: 'warning',
          code: 'LOW_PROGRAM_RATIO',
          message: `Program expense ratio is ${programRatio.toFixed(1)}% (benchmark: ≥65%)`,
          actionRequired: 'Review administrative and fundraising expenses',
        });
      }
    }

    // State registrations: not available without a live third-party integration.
    // Return null + explicit note rather than fake data.
    return {
      ein: formatEIN(cleanEIN),
      orgName: String(org['name'] ?? ''),
      taxExemptStatus: String(org['tax_exempt_status'] ?? '') === '0' ? 'revoked' : 'active',
      irsStatusDate: String(org['ruling_date'] ?? ''),
      nextFilingDue,
      filingStatus: daysUntilDue < 0 ? 'overdue' : 'current',
      daysUntilDue,
      isAtRisk: alerts.some(a => a.severity === 'critical'),
      alerts,
      stateRegistrations: null,
      stateRegistrationsNote:
        'State registration data requires a live integration with a state registration ' +
        'data provider. Configure STATE_REGISTRATION_PROVIDER to enable this field.',
      lastUpdated: new Date(),
    };
  }

  /**
   * Returns real state registration data from a configured provider.
   * Throws StateRegistrationDataUnavailableError if no provider is configured.
   *
   * Production activation:
   *  1. Wire a real provider (Harbor Compliance, CT Corp, state-specific APIs).
   *  2. Set STATE_REGISTRATION_PROVIDER env var.
   *  3. Remove the not-configured guard below.
   *
   * NEVER return mock/hardcoded registrations from this method.
   */
  async getStateRegistrations(ein: string): Promise<StateRegistration[]> {
    void ein;
    const providerConfigured = Boolean(process.env['STATE_REGISTRATION_PROVIDER']?.trim());
    if (!providerConfigured) {
      throw new StateRegistrationDataUnavailableError();
    }
    // TODO: implement real provider call when STATE_REGISTRATION_PROVIDER is set
    throw new StateRegistrationDataUnavailableError();
  }

  async getFinancialRatios(ein: string, taxYear?: number): Promise<FinancialRatios> {
    const form990 = await this.getForm990Data(ein, taxYear);

    const programRatio = calculateProgramRatio(form990.programExpenses, form990.totalExpenses);
    const adminRatio = calculateAdminRatio(form990.adminExpenses, form990.totalExpenses);
    const fundraisingROI = calculateFundraisingROI(form990.contributionsGrants, form990.fundraisingExpenses);
    const monthsOfReserves = calculateMonthsOfReserves(form990.netAssets, form990.totalExpenses);
    const healthScore = calculateFinancialHealthScore({
      programRatio,
      adminRatio,
      fundraisingRatio: 100 - programRatio - adminRatio,
      monthsOfReserves,
      revenueGrowth: 0,
      currentRatio: form990.totalAssets / Math.max(form990.totalLiabilities, 1),
    });

    return {
      ein: formatEIN(ein),
      taxYear: form990.taxYear,
      programRatio,
      adminRatio,
      fundraisingRatio: Math.max(0, 100 - programRatio - adminRatio),
      fundraisingROI,
      monthsOfReserves,
      currentRatio: form990.totalAssets / Math.max(form990.totalLiabilities, 1),
      netMargin: ((form990.totalRevenue - form990.totalExpenses) / Math.max(form990.totalRevenue, 1)) * 100,
      revenueGrowth: 0,
      healthScore,
      benchmarks: this.gradeBenchmarks(programRatio, monthsOfReserves, healthScore),
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private cleanEIN(ein: string): string {
    return ein.replace(/\D/g, '');
  }

  private mapFiling(ein: string, org: Record<string, unknown>, f: Record<string, unknown>): Form990Data {
    const pdfUrlRaw = f['pdf_url'];
    return {
      ein: formatEIN(ein),
      orgName: String(org['name'] ?? ''),
      taxYear: parseInt(String(f['tax_prd_yr'] ?? 0), 10),
      totalRevenue: parseInt(String(f['totrevenue'] ?? 0), 10),
      totalExpenses: parseInt(String(f['totfuncexpns'] ?? 0), 10),
      programServiceRevenue: parseInt(String(f['progservrev'] ?? 0), 10),
      contributionsGrants: parseInt(String(f['totcntrbgfts'] ?? 0), 10),
      programExpenses: parseInt(String(f['progservexpns'] ?? 0), 10),
      adminExpenses: parseInt(String(f['mgmtgenaladmin'] ?? 0), 10),
      fundraisingExpenses: parseInt(String(f['fundfees'] ?? 0), 10),
      netAssets: parseInt(String(f['totnetassetsend'] ?? 0), 10),
      totalAssets: parseInt(String(f['totassetsend'] ?? 0), 10),
      totalLiabilities: parseInt(String(f['totliabend'] ?? 0), 10),
      employeeCount: parseInt(String(f['noemployees'] ?? 0), 10),
      volunteerCount: parseInt(String(f['novollunteers'] ?? 0), 10),
      missionStatement: String(f['missiondesc'] ?? org['activity'] ?? ''),
      nteeCode: String(org['ntee_code'] ?? ''),
      filingDate: String(f['updated'] ?? ''),
      taxPeriodEnd: String(f['tax_prd'] ?? ''),
      ...(pdfUrlRaw ? { pdfUrl: String(pdfUrlRaw) } : {}),
    };
  }

  private inferFormType(f: Record<string, unknown>): '990' | '990-EZ' | '990-N' | '990-PF' {
    const revenue = parseInt(String(f['totrevenue'] ?? 0), 10);
    if (revenue > 200000) return '990';
    if (revenue > 50000) return '990-EZ';
    return '990-N';
  }

  private calculateNextFilingDue(taxPeriodEnd?: string): Date {
    const base = taxPeriodEnd ? new Date(taxPeriodEnd) : new Date();
    base.setMonth(base.getMonth() + 4); // IRS: 4.5 months after year end; using 4 for buffer
    base.setDate(15);
    return base;
  }

  private gradeBenchmarks(programRatio: number, monthsOfReserves: number, healthScore: number): RatioBenchmarks {
    const pGrade = programRatio >= 80 ? 'A' : programRatio >= 70 ? 'B' : programRatio >= 65 ? 'C' : programRatio >= 55 ? 'D' : 'F';
    const rGrade = monthsOfReserves >= 6 ? 'A' : monthsOfReserves >= 3 ? 'B' : monthsOfReserves >= 2 ? 'C' : monthsOfReserves >= 1 ? 'D' : 'F';
    const overall = healthScore >= 80 ? 'excellent' : healthScore >= 65 ? 'good' : healthScore >= 50 ? 'adequate' : 'poor';
    return {
      programRatioGrade: pGrade,
      reservesGrade: rGrade,
      overallRating: overall,
      narrative: `Organization scores ${healthScore}/100. Program ratio ${pGrade === 'A' ? 'exceeds' : 'is below'} the 75%+ excellence threshold. Reserves provide ${monthsOfReserves.toFixed(1)} months of operating coverage.`,
    };
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

export default ComplianceService;

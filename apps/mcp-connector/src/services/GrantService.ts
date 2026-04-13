/**
 * Magnus MCP Connector — GrantService
 * Grant opportunity matching, eligibility checking, history, funder research
 * Called by: find-opportunities, check-eligibility, get-grant-history, get-funder-research
 */

import axios, { AxiosInstance } from 'axios';
import { CandidAPIError } from '../utils/errors';
import { calculateGrantMatchScore } from '../utils/calculators';
import { formatCurrency } from '../utils/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GrantOpportunity {
  id: string;
  funderName: string;
  funderEIN?: string;
  programName: string;
  description: string;
  focusAreas: string[];
  eligibleNTEECodes: string[];
  eligibleStates: string[];
  minGrantAmount: number;
  maxGrantAmount: number;
  totalGiving: number;
  applicationDeadline?: string;
  letterOfInquiryDeadline?: string;
  isRollingDeadline: boolean;
  applicationUrl?: string;
  contactEmail?: string;
  requiresLetterOfInquiry: boolean;
  averageGrantSize: number;
  grantCount: number;
  acceptsUnsolicited: boolean;
  lastUpdated: string;
}

export interface GrantMatch {
  opportunity: GrantOpportunity;
  matchScore: number;
  matchReasons: string[];
  missingCriteria: string[];
  urgency: 'high' | 'medium' | 'low';
  recommendedAction: string;
}

export interface EligibilityResult {
  isEligible: boolean;
  score: number;
  reasons: string[];
  barriers: string[];
  conditionalFactors: string[];
  recommendation: string;
}

export interface GrantHistoryRecord {
  funderName: string;
  funderEIN?: string;
  programName?: string;
  grantAmount: number;
  grantYear: number;
  grantPurpose: string;
  isMultiYear: boolean;
  renewalEligible: boolean;
}

export interface FunderProfile {
  ein: string;
  name: string;
  type: 'private_foundation' | 'community_foundation' | 'corporate_foundation' | 'public_charity' | 'government';
  location: string;
  annualGiving: number;
  averageGrant: number;
  totalAssets: number;
  focusAreas: string[];
  geographicFocus: string[];
  nteeFocus: string[];
  acceptsUnsolicited: boolean;
  hasLOIRequirement: boolean;
  applicationCycle: 'rolling' | 'annual' | 'quarterly' | 'biannual';
  deadlines: string[];
  websiteUrl?: string;
  staffContact?: string;
  recentGrants: Array<{ recipient: string; amount: number; year: number; purpose: string }>;
  grantingHistory: Array<{ year: number; totalGiven: number; grantCount: number }>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class GrantService {
  private readonly candidClient: AxiosInstance;
  private readonly cache = new Map<string, { data: unknown; expiresAt: number }>();
  private readonly cacheTTL = 7200 * 1000; // 2 hours (grant data changes less often)

  constructor() {
    this.candidClient = axios.create({
      baseURL: process.env['CANDID_BASE_URL'] ?? 'https://api.candid.org/v3',
      headers: {
        'Subscription-Key': process.env['CANDID_API_KEY'] ?? '',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async findOpportunities(params: {
    nteeCode: string;
    state: string;
    annualBudget: number;
    focusAreas?: string[];
    minGrantAmount?: number;
    maxResults?: number;
  }): Promise<GrantMatch[]> {
    const cacheKey = `opportunities:${params.nteeCode}:${params.state}:${params.annualBudget}`;
    const cached = this.fromCache<GrantMatch[]>(cacheKey);
    if (cached) return cached;

    try {
      // Candid API only — no seed/fallback data in production.
      // If Candid is unavailable, throw CandidAPIError (fail closed).
      const response = await this.candidClient.post('/grants/search', {
        ntee_codes: [params.nteeCode],
        states: [params.state],
        min_grant: params.minGrantAmount ?? 5000,
        limit: params.maxResults ?? 20,
      });
      const opportunities: GrantOpportunity[] = (response.data?.grants ?? []).map(this.mapCandidGrant.bind(this));

      const matches: GrantMatch[] = opportunities.map(opp => {
        const { score, reasons } = calculateGrantMatchScore({
          nteeCode: params.nteeCode,
          state: params.state,
          annualBudget: params.annualBudget,
          focusAreas: params.focusAreas ?? [],
        }, {
          eligibleNTEECodes: opp.eligibleNTEECodes,
          eligibleStates: opp.eligibleStates,
          minGrantAmount: opp.minGrantAmount,
          maxGrantAmount: opp.maxGrantAmount,
          focusAreas: opp.focusAreas,
        });

        const daysUntilDeadline = opp.applicationDeadline
          ? Math.floor((new Date(opp.applicationDeadline).getTime() - Date.now()) / 86400000)
          : null;

        return {
          opportunity: opp,
          matchScore: score,
          matchReasons: reasons,
          missingCriteria: [],
          urgency: daysUntilDeadline !== null && daysUntilDeadline < 30
            ? 'high'
            : daysUntilDeadline !== null && daysUntilDeadline < 90
              ? 'medium'
              : 'low',
          recommendedAction: opp.requiresLetterOfInquiry
            ? 'Submit Letter of Inquiry before applying'
            : `Apply directly at ${opp.applicationUrl ?? 'funder website'}`,
        };
      });

      const sorted = matches
        .filter(m => m.matchScore > 40)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, params.maxResults ?? 10);

      this.toCache(cacheKey, sorted);
      return sorted;
    } catch (err) {
      throw new CandidAPIError('Failed to fetch grant opportunities', err instanceof Error ? err : undefined);
    }
  }

  async checkEligibility(params: {
    ein: string;
    funderEIN: string;
    orgNTEECode: string;
    orgState: string;
    annualBudget: number;
    yearsInOperation: number;
    has501c3: boolean;
  }): Promise<EligibilityResult> {
    const reasons: string[] = [];
    const barriers: string[] = [];
    const conditionalFactors: string[] = [];
    let score = 100;

    if (!params.has501c3) {
      barriers.push('Organization must have 501(c)(3) status');
      score -= 40;
    } else {
      reasons.push('501(c)(3) status confirmed');
    }

    if (params.yearsInOperation < 1) {
      barriers.push('Most funders require at least 1 year of operation');
      score -= 20;
    } else if (params.yearsInOperation < 3) {
      conditionalFactors.push('Some funders prefer 3+ years of operation; apply to emerging nonprofit programs');
      score -= 10;
    } else {
      reasons.push(`${params.yearsInOperation} years of operating history`);
    }

    if (params.annualBudget < 25000) {
      conditionalFactors.push('Very small budget — focus on startup and micro-grants');
      score -= 15;
    } else if (params.annualBudget > 10000000) {
      conditionalFactors.push('Large-budget orgs may be deprioritized for some community grants');
    } else {
      reasons.push(`Budget of ${formatCurrency(params.annualBudget)} is within typical grant range`);
    }

    return {
      isEligible: score >= 60 && barriers.length === 0,
      score: Math.max(0, score),
      reasons,
      barriers,
      conditionalFactors,
      recommendation: score >= 80
        ? 'Strong eligibility — prioritize application'
        : score >= 60
          ? 'Good eligibility — address conditional factors before applying'
          : 'Address barriers before applying',
    };
  }

  async getGrantHistory(ein: string): Promise<GrantHistoryRecord[]> {
    const cleanEIN = ein.replace(/\D/g, '');
    const cacheKey = `grant-history:${cleanEIN}`;
    const cached = this.fromCache<GrantHistoryRecord[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.candidClient.get(`/grants/received/${cleanEIN}`);
      const records: GrantHistoryRecord[] = (response.data?.grants ?? []).map(
        (g: Record<string, unknown>): GrantHistoryRecord => {
          const funderEinRaw = g['funder_ein'];
          const programNameRaw = g['program_name'];
          return {
            funderName: String(g['funder_name'] ?? ''),
            ...(funderEinRaw ? { funderEIN: String(funderEinRaw) } : {}),
            ...(programNameRaw ? { programName: String(programNameRaw) } : {}),
            grantAmount: parseInt(String(g['amount'] ?? 0), 10),
            grantYear: parseInt(String(g['year'] ?? 0), 10),
            grantPurpose: String(g['purpose'] ?? ''),
            isMultiYear: Boolean(g['multi_year']),
            renewalEligible: Boolean(g['renewal_eligible']),
          };
        }
      );
      this.toCache(cacheKey, records);
      return records;
    } catch {
      // Return empty array if Candid API unavailable — not a blocking error
      return [];
    }
  }

  async getFunderResearch(funderEIN: string): Promise<FunderProfile> {
    const cleanEIN = funderEIN.replace(/\D/g, '');
    const cacheKey = `funder:${cleanEIN}`;
    const cached = this.fromCache<FunderProfile>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.candidClient.get(`/essentials/${cleanEIN}`);
      const data = response.data;
      const profile: FunderProfile = {
        ein: cleanEIN,
        name: String(data['org_name'] ?? ''),
        type: this.inferFunderType(data),
        location: `${data['city'] ?? ''}, ${data['state'] ?? ''}`,
        annualGiving: parseInt(String(data['total_giving'] ?? 0), 10),
        averageGrant: parseInt(String(data['avg_grant'] ?? 0), 10),
        totalAssets: parseInt(String(data['total_assets'] ?? 0), 10),
        focusAreas: Array.isArray(data['focus_areas']) ? data['focus_areas'] : [],
        geographicFocus: Array.isArray(data['geo_focus']) ? data['geo_focus'] : [],
        nteeFocus: Array.isArray(data['ntee_focus']) ? data['ntee_focus'] : [],
        acceptsUnsolicited: Boolean(data['accepts_unsolicited']),
        hasLOIRequirement: Boolean(data['loi_required']),
        applicationCycle: 'rolling',
        deadlines: [],
        ...(data['website'] ? { websiteUrl: String(data['website']) } : {}),
        ...(data['contact_name'] ? { staffContact: String(data['contact_name']) } : {}),
        recentGrants: [],
        grantingHistory: [],
      };
      this.toCache(cacheKey, profile);
      return profile;
    } catch (err) {
      throw new CandidAPIError(`Failed to fetch funder profile for EIN ${cleanEIN}`, err instanceof Error ? err : undefined);
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private mapCandidGrant(g: Record<string, unknown>): GrantOpportunity {
    const funderEinRaw = g['funder_ein'];
    const deadlineRaw = g['deadline'];
    const applyUrlRaw = g['apply_url'];
    return {
      // Use the Candid-provided ID; empty string if absent (should not happen in real API responses).
      id: String(g['id'] ?? ''),
      funderName: String(g['funder_name'] ?? ''),
      ...(funderEinRaw ? { funderEIN: String(funderEinRaw) } : {}),
      programName: String(g['program_name'] ?? ''),
      description: String(g['description'] ?? ''),
      focusAreas: Array.isArray(g['focus_areas']) ? g['focus_areas'].map(String) : [],
      eligibleNTEECodes: Array.isArray(g['ntee_codes']) ? g['ntee_codes'].map(String) : [],
      eligibleStates: Array.isArray(g['eligible_states']) ? g['eligible_states'].map(String) : ['All'],
      minGrantAmount: parseInt(String(g['min_grant'] ?? 0), 10),
      maxGrantAmount: parseInt(String(g['max_grant'] ?? 0), 10),
      totalGiving: parseInt(String(g['total_giving'] ?? 0), 10),
      ...(deadlineRaw ? { applicationDeadline: String(deadlineRaw) } : {}),
      isRollingDeadline: Boolean(g['rolling_deadline']),
      ...(applyUrlRaw ? { applicationUrl: String(applyUrlRaw) } : {}),
      requiresLetterOfInquiry: Boolean(g['loi_required']),
      averageGrantSize: parseInt(String(g['avg_grant'] ?? 0), 10),
      grantCount: parseInt(String(g['grant_count'] ?? 0), 10),
      acceptsUnsolicited: Boolean(g['accepts_unsolicited']),
      lastUpdated: String(g['updated_at'] ?? new Date().toISOString()),
    };
  }

  /**
   * getSeedOpportunities has been DELETED.
   * Returning fabricated grant opportunities as a Candid API fallback was a truth violation.
   * Callers now receive CandidAPIError when Candid is unavailable.
   * Reactivation requires a real Candid API key and a verified connection.
   */

  private inferFunderType(data: Record<string, unknown>): FunderProfile['type'] {
    const ntee = String(data['ntee_code'] ?? '');
    if (ntee.startsWith('T20')) return 'private_foundation';
    if (ntee.startsWith('T30')) return 'public_charity';
    if (ntee.startsWith('T70')) return 'community_foundation';
    return 'public_charity';
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

export default GrantService;

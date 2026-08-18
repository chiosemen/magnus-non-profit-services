import { createHash } from 'node:crypto';

/**
 * Provenance for an opportunity record (P0-4, SPEC-P0 R4).
 * - source: which system produced the record.
 * - idSource: 'provider' when the id came from the source system,
 *   'content-hash' when derived deterministically from identifying content.
 * - missingFields: raw fields the source did not provide; the corresponding
 *   values are null (strings/booleans) or a documented neutral 0 that the
 *   deterministic scorer treats as "no data" (numerics).
 */
export type OpportunityProvenance = {
  source: 'candid' | 'seed';
  idSource: 'provider' | 'content-hash' | 'seed';
  missingFields: string[];
};

export type GrantOpportunity = {
  id: string;
  funderName: string | null;
  funderEIN?: string;
  programName: string | null;
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
  acceptsUnsolicited: boolean | null;
  lastUpdated?: string;
  provenance: OpportunityProvenance;
};

export type GrantMatch = {
  opportunity: GrantOpportunity;
  matchScore: number;
  matchReasons: string[];
  missingCriteria: string[];
  urgency: 'high' | 'medium' | 'low' | 'unknown';
  recommendedAction: string;
};

export type OpportunityFetcher = (params: {
  nteeCode: string;
  state: string;
  annualBudget: number;
  focusAreas: string[];
  minGrantAmount?: number;
  maxResults?: number;
}) => Promise<GrantMatch[]>;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Copied 1:1 from `apps/mcp-connector/src/utils/calculators.ts` to keep HERALD truthful and consistent
 * without importing an app package into agents.
 */
export function calculateGrantMatchScore(
  org: { nteeCode: string; state: string; annualBudget: number; focusAreas: string[] },
  opp: { eligibleNTEECodes: string[]; eligibleStates: string[]; minGrantAmount: number; maxGrantAmount: number; focusAreas: string[] },
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (opp.eligibleNTEECodes?.includes(org.nteeCode)) {
    score += 35;
    reasons.push('NTEE code is eligible');
  } else {
    reasons.push('NTEE code may not be eligible');
  }

  if (opp.eligibleStates?.includes(org.state)) {
    score += 25;
    reasons.push('State is eligible');
  } else {
    reasons.push('State may not be eligible');
  }

  const avgGrant = (opp.minGrantAmount + opp.maxGrantAmount) / 2;
  if (Number.isFinite(avgGrant) && avgGrant > 0 && org.annualBudget > 0) {
    const ratio = avgGrant / org.annualBudget;
    if (ratio <= 0.25) {
      score += 20;
      reasons.push('Grant size is reasonable relative to annual budget');
    } else if (ratio <= 0.5) {
      score += 10;
      reasons.push('Grant size is somewhat large relative to annual budget');
    } else {
      reasons.push('Grant size may be too large relative to annual budget');
    }
  }

  const orgAreas = new Set((org.focusAreas ?? []).map(s => s.toLowerCase()));
  const overlap = (opp.focusAreas ?? []).filter(a => orgAreas.has(a.toLowerCase())).length;
  if (overlap > 0) {
    score += 20;
    reasons.push('Focus areas align');
  } else {
    reasons.push('Focus areas may not align');
  }

  return { score: Math.round(clamp(score, 0, 100)), reasons };
}

function missingCriteriaFromRuleInputs(params: {
  org: { nteeCode: string; state: string; annualBudget: number; focusAreas: string[] };
  opp: { eligibleNTEECodes: string[]; eligibleStates: string[]; minGrantAmount: number; maxGrantAmount: number; focusAreas: string[] };
}): string[] {
  const missing: string[] = [];
  if (!params.opp.eligibleNTEECodes?.includes(params.org.nteeCode)) missing.push('ntee_not_listed');
  if (!params.opp.eligibleStates?.includes(params.org.state)) missing.push('state_not_listed');

  const orgAreas = new Set((params.org.focusAreas ?? []).map(s => s.toLowerCase()));
  const overlap = (params.opp.focusAreas ?? []).filter(a => orgAreas.has(String(a).toLowerCase())).length;
  if (overlap === 0) missing.push('focus_areas_no_overlap');

  const avgGrant = (params.opp.minGrantAmount + params.opp.maxGrantAmount) / 2;
  if (Number.isFinite(avgGrant) && avgGrant > 0 && params.org.annualBudget > 0) {
    const ratio = avgGrant / params.org.annualBudget;
    if (ratio > 0.5) missing.push('grant_size_large_vs_budget');
  }

  return missing;
}

function seedOpportunities(nteeCode: string, state: string): GrantOpportunity[] {
  // Dev/demo fallback only; intentionally small and generic.
  return [
    {
      id: `seed-${nteeCode}-${state}-1`,
      funderName: 'Seed Community Foundation',
      programName: 'General Operating Support',
      provenance: { source: 'seed', idSource: 'seed', missingFields: [] },
      description: 'Seed opportunity used when Candid is unavailable.',
      focusAreas: ['community', 'education'],
      eligibleNTEECodes: [nteeCode],
      eligibleStates: [state],
      minGrantAmount: 5000,
      maxGrantAmount: 25000,
      totalGiving: 1_000_000,
      applicationDeadline: undefined,
      letterOfInquiryDeadline: undefined,
      isRollingDeadline: true,
      applicationUrl: 'https://example.invalid/funder/seed',
      contactEmail: undefined,
      requiresLetterOfInquiry: false,
      averageGrantSize: 15000,
      grantCount: 40,
      acceptsUnsolicited: true,
      lastUpdated: new Date().toISOString(),
    },
  ];
}

/**
 * Deterministic id for a Candid record that lacks a provider id (P0-4, R4).
 * Same identifying content -> same id on every run, so dedupe keys, LOI
 * selections, and operational memory stay stable. Records with NO
 * identifying content at all cannot be honestly tracked and are rejected.
 */
function contentHashId(identity: {
  funderEIN?: string;
  funderName: string | null;
  programName: string | null;
  applicationUrl?: string;
}): string {
  const material = [
    identity.funderEIN ?? '',
    identity.funderName ?? '',
    identity.programName ?? '',
    identity.applicationUrl ?? '',
  ].join('');
  return `candid-sha256-${createHash('sha256').update(material).digest('hex').slice(0, 16)}`;
}

/**
 * Maps a raw Candid record to a GrantOpportunity, or returns null when the
 * record carries no identifying content (no id, funder EIN, funder name,
 * program name, or application URL) — such a record is rejected rather than
 * given a randomly generated identity (P0-4, SPEC-P0 R4).
 */
export function mapCandidGrant(raw: any): GrantOpportunity | null {
  const safeArr = (v: any): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  const safeNum = (v: any, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  const missingFields: string[] = [];
  const strOrNull = (v: any, field: string): string | null => {
    if (typeof v === 'string' && v.trim().length > 0) return v;
    missingFields.push(field);
    return null;
  };
  const trackNum = (v: any, field: string): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    missingFields.push(field);
    return 0; // neutral for the deterministic scorer, declared in provenance
  };

  const funderName = strOrNull(raw?.funder_name ?? raw?.funderName, 'funderName');
  const programName = strOrNull(raw?.program_name ?? raw?.programName, 'programName');
  const funderEIN = typeof raw?.funder_ein === 'string' ? raw.funder_ein : undefined;
  const applicationUrl = typeof raw?.application_url === 'string' ? raw.application_url : undefined;

  const providerId =
    typeof raw?.id === 'string' && raw.id.trim().length > 0 ? raw.id : null;

  if (!providerId && !funderEIN && !funderName && !programName && !applicationUrl) {
    // Nothing identifies this record; a synthesized identity would be a lie.
    return null;
  }

  const acceptsUnsolicitedRaw = raw?.accepts_unsolicited ?? raw?.acceptsUnsolicited;
  let acceptsUnsolicited: boolean | null;
  if (typeof acceptsUnsolicitedRaw === 'boolean') {
    acceptsUnsolicited = acceptsUnsolicitedRaw;
  } else {
    // Previously defaulted to true — a fabricated favorable claim.
    missingFields.push('acceptsUnsolicited');
    acceptsUnsolicited = null;
  }

  return {
    id: providerId ?? contentHashId({ funderEIN, funderName, programName, applicationUrl }),
    funderName,
    funderEIN,
    programName,
    description: typeof raw?.description === 'string' ? raw.description : '',
    focusAreas: safeArr(raw?.focus_areas ?? raw?.focusAreas),
    eligibleNTEECodes: safeArr(raw?.eligible_ntee_codes ?? raw?.eligibleNTEECodes),
    eligibleStates: safeArr(raw?.eligible_states ?? raw?.eligibleStates),
    minGrantAmount: trackNum(raw?.min_grant_amount ?? raw?.minGrantAmount, 'minGrantAmount'),
    maxGrantAmount: trackNum(raw?.max_grant_amount ?? raw?.maxGrantAmount, 'maxGrantAmount'),
    totalGiving: trackNum(raw?.total_giving ?? raw?.totalGiving, 'totalGiving'),
    applicationDeadline: typeof raw?.application_deadline === 'string' ? raw.application_deadline : undefined,
    letterOfInquiryDeadline: typeof raw?.letter_of_inquiry_deadline === 'string' ? raw.letter_of_inquiry_deadline : undefined,
    isRollingDeadline: Boolean(raw?.is_rolling_deadline ?? raw?.isRollingDeadline ?? false),
    applicationUrl,
    contactEmail: typeof raw?.contact_email === 'string' ? raw.contact_email : undefined,
    requiresLetterOfInquiry: Boolean(raw?.requires_letter_of_inquiry ?? raw?.requiresLetterOfInquiry ?? false),
    averageGrantSize: trackNum(raw?.average_grant_size ?? raw?.averageGrantSize, 'averageGrantSize'),
    grantCount: trackNum(raw?.grant_count ?? raw?.grantCount, 'grantCount'),
    acceptsUnsolicited,
    lastUpdated: typeof raw?.last_updated === 'string' ? raw.last_updated : undefined,
    provenance: {
      source: 'candid',
      idSource: providerId ? 'provider' : 'content-hash',
      missingFields,
    },
  };
}

function urgencyFromDeadline(applicationDeadline?: string): 'high' | 'medium' | 'low' | 'unknown' {
  if (!applicationDeadline) return 'unknown';
  const d = new Date(applicationDeadline);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const days = Math.floor((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'high';
  if (days < 30) return 'high';
  if (days < 90) return 'medium';
  return 'low';
}

export function createCandidOpportunityFetcher(): OpportunityFetcher {
  return async params => {
    const baseUrl = process.env['CANDID_BASE_URL'] ?? 'https://api.candid.org/v3';
    const apiKey = process.env['CANDID_API_KEY'] ?? '';
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    const isProd = nodeEnv === 'production';
    const limit = params.maxResults ?? 20;

    let opportunities: GrantOpportunity[] = [];
    try {
      if (!apiKey.trim()) {
        if (isProd) throw new Error('CANDID_API_KEY_MISSING');
        opportunities = seedOpportunities(params.nteeCode, params.state);
        // Continue to matching below.
      } else {
      const resp = await fetch(`${baseUrl}/grants/search`, {
        method: 'POST',
        headers: {
          'Subscription-Key': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ntee_codes: [params.nteeCode],
          states: [params.state],
          min_grant: params.minGrantAmount ?? 5000,
          limit,
        }),
      });
        if (!resp.ok) throw new Error('CANDID_NON_200');
        const json: any = await resp.json();
        const raws = Array.isArray(json?.grants) ? json.grants : [];
        // Records with no identifying content are rejected (null), never
        // given a synthesized identity.
        opportunities = raws
          .map(mapCandidGrant)
          .filter((o: GrantOpportunity | null): o is GrantOpportunity => o !== null);
      }
    } catch {
      if (isProd) {
        throw new Error('CANDID_UNAVAILABLE');
      }
      opportunities = seedOpportunities(params.nteeCode, params.state);
    }

    const matches: GrantMatch[] = opportunities.map(opp => {
      const orgRuleInputs = {
        nteeCode: params.nteeCode,
        state: params.state,
        annualBudget: params.annualBudget,
        focusAreas: params.focusAreas,
      };
      const oppRuleInputs = {
        eligibleNTEECodes: opp.eligibleNTEECodes,
        eligibleStates: opp.eligibleStates,
        minGrantAmount: opp.minGrantAmount,
        maxGrantAmount: opp.maxGrantAmount,
        focusAreas: opp.focusAreas,
      };
      const { score, reasons } = calculateGrantMatchScore(
        orgRuleInputs,
        oppRuleInputs,
      );
      const urgency = urgencyFromDeadline(opp.applicationDeadline);
      return {
        opportunity: opp,
        matchScore: score,
        matchReasons: reasons,
        missingCriteria: missingCriteriaFromRuleInputs({ org: orgRuleInputs, opp: oppRuleInputs }),
        urgency,
        recommendedAction: opp.requiresLetterOfInquiry
          ? 'Prepare Letter of Inquiry (internal draft only)'
          : `Prepare application draft (internal only) — verify submission rules at ${opp.applicationUrl ?? 'funder site'}`,
      };
    });

    return matches
      .filter(m => m.matchScore > 40)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, params.maxResults ?? 10);
  };
}


export type GrantOpportunity = {
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
  lastUpdated?: string;
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

function seedOpportunities(nteeCode: string, state: string): GrantOpportunity[] {
  // Dev/demo fallback only; intentionally small and generic.
  return [
    {
      id: `seed-${nteeCode}-${state}-1`,
      funderName: 'Seed Community Foundation',
      programName: 'General Operating Support',
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

function mapCandidGrant(raw: any): GrantOpportunity {
  const safeArr = (v: any): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  const safeNum = (v: any, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const safeStr = (v: any, d = ''): string => (typeof v === 'string' ? v : d);
  return {
    id: safeStr(raw?.id, `candid-${Math.random().toString(16).slice(2)}`),
    funderName: safeStr(raw?.funder_name ?? raw?.funderName, 'Unknown funder'),
    funderEIN: typeof raw?.funder_ein === 'string' ? raw.funder_ein : undefined,
    programName: safeStr(raw?.program_name ?? raw?.programName, 'Program'),
    description: safeStr(raw?.description, ''),
    focusAreas: safeArr(raw?.focus_areas ?? raw?.focusAreas),
    eligibleNTEECodes: safeArr(raw?.eligible_ntee_codes ?? raw?.eligibleNTEECodes),
    eligibleStates: safeArr(raw?.eligible_states ?? raw?.eligibleStates),
    minGrantAmount: safeNum(raw?.min_grant_amount ?? raw?.minGrantAmount, 0),
    maxGrantAmount: safeNum(raw?.max_grant_amount ?? raw?.maxGrantAmount, 0),
    totalGiving: safeNum(raw?.total_giving ?? raw?.totalGiving, 0),
    applicationDeadline: typeof raw?.application_deadline === 'string' ? raw.application_deadline : undefined,
    letterOfInquiryDeadline: typeof raw?.letter_of_inquiry_deadline === 'string' ? raw.letter_of_inquiry_deadline : undefined,
    isRollingDeadline: Boolean(raw?.is_rolling_deadline ?? raw?.isRollingDeadline ?? false),
    applicationUrl: typeof raw?.application_url === 'string' ? raw.application_url : undefined,
    contactEmail: typeof raw?.contact_email === 'string' ? raw.contact_email : undefined,
    requiresLetterOfInquiry: Boolean(raw?.requires_letter_of_inquiry ?? raw?.requiresLetterOfInquiry ?? false),
    averageGrantSize: safeNum(raw?.average_grant_size ?? raw?.averageGrantSize, 0),
    grantCount: safeNum(raw?.grant_count ?? raw?.grantCount, 0),
    acceptsUnsolicited: Boolean(raw?.accepts_unsolicited ?? raw?.acceptsUnsolicited ?? true),
    lastUpdated: typeof raw?.last_updated === 'string' ? raw.last_updated : undefined,
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
    const limit = params.maxResults ?? 20;

    let opportunities: GrantOpportunity[] = [];
    try {
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
      opportunities = raws.map(mapCandidGrant);
    } catch {
      opportunities = seedOpportunities(params.nteeCode, params.state);
    }

    const matches: GrantMatch[] = opportunities.map(opp => {
      const { score, reasons } = calculateGrantMatchScore(
        { nteeCode: params.nteeCode, state: params.state, annualBudget: params.annualBudget, focusAreas: params.focusAreas },
        {
          eligibleNTEECodes: opp.eligibleNTEECodes,
          eligibleStates: opp.eligibleStates,
          minGrantAmount: opp.minGrantAmount,
          maxGrantAmount: opp.maxGrantAmount,
          focusAreas: opp.focusAreas,
        },
      );
      const urgency = urgencyFromDeadline(opp.applicationDeadline);
      return {
        opportunity: opp,
        matchScore: score,
        matchReasons: reasons,
        missingCriteria: [],
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


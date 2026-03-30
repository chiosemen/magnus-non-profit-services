import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Contracts (v1)
// ─────────────────────────────────────────────────────────────────────────────

export const GrantProspectOrgSchema = z.object({
  nteeCode: z.string().min(1).max(20),
  state: z.string().min(2).max(2),
  annualBudgetUsd: z.number().finite().positive().max(10_000_000_000),
  focusAreas: z.array(z.string().min(1).max(200)).max(25).default([]),
}).strict();

export const GrantProspectProgramSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  focusAreas: z.array(z.string().min(1).max(200)).max(25).default([]),
  geography: z.string().min(1).max(400).optional(),
}).strict();

export const GrantProspectAskSchema = z.object({
  amountUsd: z.number().finite().positive().max(100_000_000).optional(),
}).strict();

export const GrantProspectMatchRequestSchema = z.object({
  org: GrantProspectOrgSchema,
  program: GrantProspectProgramSchema.optional(),
  ask: GrantProspectAskSchema.optional(),
  maxResults: z.number().int().min(1).max(50).default(15),
}).strict();

export type GrantProspectMatchRequest = z.infer<typeof GrantProspectMatchRequestSchema>;

export type GrantProspectMatchStatus = 'OK' | 'INSUFFICIENT_DATA' | 'NOT_CONFIGURED';

export const GrantOpportunitySchema = z.object({
  id: z.string().min(1),
  funderName: z.string().min(1),
  funderEIN: z.string().min(1).optional(),
  programName: z.string().optional().default(''),
  description: z.string().optional().default(''),
  focusAreas: z.array(z.string()).default([]),
  eligibleNTEECodes: z.array(z.string()).default([]),
  eligibleStates: z.array(z.string()).default([]),
  minGrantAmount: z.number().finite().nonnegative().default(0),
  maxGrantAmount: z.number().finite().nonnegative().default(0),
  applicationDeadline: z.string().optional(),
  isRollingDeadline: z.boolean().default(false),
  requiresLetterOfInquiry: z.boolean().default(false),
  acceptsUnsolicited: z.boolean().default(true),
  applicationUrl: z.string().optional(),
  lastUpdated: z.string().optional(),
}).strict();

export type GrantOpportunity = z.infer<typeof GrantOpportunitySchema>;

export const GrantProspectMatchSchema = z.object({
  funder_name: z.string(),
  funder_ein: z.string().optional(),
  opportunity_id: z.string(),
  program_name: z.string(),
  match_score: z.number().int().min(0).max(100),
  match_reasons: z.array(z.string().min(1)).default([]),
  excluded_reasons: z.array(z.string().min(1)).default([]),
  factor_coverage: z.object({
    program_area: z.enum(['MATCHED', 'NOT_MATCHED', 'UNKNOWN']),
    geography: z.enum(['MATCHED', 'NOT_MATCHED', 'UNKNOWN']),
    award_size: z.enum(['MATCHED', 'NOT_MATCHED', 'UNKNOWN']),
    funder_type: z.enum(['MATCHED', 'NOT_MATCHED', 'UNKNOWN']),
    deadline: z.enum(['KNOWN', 'UNKNOWN']),
  }).strict(),
  deadline: z.object({
    application_deadline: z.string().optional(),
    rolling: z.boolean(),
    urgency: z.enum(['high', 'medium', 'low', 'unknown']),
  }).strict(),
}).strict();

export type GrantProspectMatch = z.infer<typeof GrantProspectMatchSchema>;

export const GrantProspectMatchResultSchema = z.object({
  status: z.custom<GrantProspectMatchStatus>(),
  warnings: z.array(z.string().min(1)).default([]),
  data_basis: z.object({
    source: z.enum(['candid_api', 'none']),
    notes: z.string(),
  }).strict(),
  matches: z.array(GrantProspectMatchSchema).default([]),
}).strict();

export type GrantProspectMatchResult = z.infer<typeof GrantProspectMatchResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic matching (v1)
// ─────────────────────────────────────────────────────────────────────────────

export function rankGrantProspects(params: {
  input: GrantProspectMatchRequest;
  opportunities: GrantOpportunity[];
}): GrantProspectMatchResult {
  const input = GrantProspectMatchRequestSchema.parse(params.input);
  const opportunities = z.array(GrantOpportunitySchema).parse(params.opportunities);

  const warnings: string[] = [];

  const orgFocus = new Set(input.org.focusAreas.map(s => s.toLowerCase()));
  const programFocus = new Set((input.program?.focusAreas ?? []).map(s => s.toLowerCase()));
  const combinedFocus = new Set([...orgFocus, ...programFocus]);

  const hasAnyFocus = combinedFocus.size > 0;
  if (!hasAnyFocus) warnings.push('No focus areas provided; program-area alignment will be weak.');

  const askAmount = input.ask?.amountUsd;
  if (!Number.isFinite(askAmount ?? NaN)) warnings.push('No ask amount provided; award-size fit will be approximated using annual budget.');

  const matches = opportunities.map((opp): GrantProspectMatch => {
    const reasons: string[] = [];
    const excluded: string[] = [];
    let score = 0;

    // 1) Program area alignment (NTEE + focus overlap)
    const nteeMatched = opp.eligibleNTEECodes.includes(input.org.nteeCode);
    if (nteeMatched) { score += 35; reasons.push('NTEE code is explicitly eligible'); }
    else { reasons.push('NTEE eligibility not confirmed from available data'); }

    const overlap = (opp.focusAreas ?? []).filter(a => combinedFocus.has(String(a).toLowerCase())).length;
    if (overlap > 0) { score += 20; reasons.push('Focus areas overlap with program/org focus'); }
    else if (hasAnyFocus) { reasons.push('No focus-area overlap found'); }
    else { reasons.push('Focus-area alignment unknown (no focus areas provided)'); }

    // 2) Geography alignment (treat "All"/"National" as eligible)
    const eligibleStates = (opp.eligibleStates ?? []).map(s => String(s).toUpperCase());
    const geoMatched = eligibleStates.includes(input.org.state.toUpperCase()) || eligibleStates.includes('ALL') || eligibleStates.includes('NATIONAL') || eligibleStates.includes('US');
    if (geoMatched) { score += 25; reasons.push('Geography appears eligible'); }
    else if (eligibleStates.length) { reasons.push('Geography may not be eligible'); }
    else { reasons.push('Geography eligibility unknown'); }

    // 3) Award size fit (prefer ask amount; fallback to annual budget heuristic)
    const min = Number.isFinite(opp.minGrantAmount) ? opp.minGrantAmount : 0;
    const max = Number.isFinite(opp.maxGrantAmount) ? opp.maxGrantAmount : 0;
    if (Number.isFinite(askAmount ?? NaN)) {
      const a = askAmount as number;
      if (min > 0 && a < min) { excluded.push('Ask amount is below the minimum grant size (based on available data)'); }
      if (max > 0 && a > max) { excluded.push('Ask amount exceeds the maximum grant size (based on available data)'); }
      if (!excluded.length) { score += 20; reasons.push('Ask amount appears within stated grant size range (or range not provided)'); }
    } else {
      const avgGrant = (min + max) / 2;
      if (Number.isFinite(avgGrant) && avgGrant > 0 && input.org.annualBudgetUsd > 0) {
        const ratio = avgGrant / input.org.annualBudgetUsd;
        if (ratio <= 0.25) { score += 20; reasons.push('Typical grant size is reasonable relative to annual budget'); }
        else if (ratio <= 0.5) { score += 10; reasons.push('Typical grant size is somewhat large relative to annual budget'); }
        else { reasons.push('Typical grant size may be too large relative to annual budget'); }
      } else {
        reasons.push('Award-size fit unknown (grant size range missing)');
      }
    }

    // 4) Funder type fit — unavailable in current opportunity payload
    reasons.push('Funder type fit not scored (insufficient typed funder data in current source).');

    // 5) Deadline proximity — only if real deadline exists
    const deadline = opp.applicationDeadline ? new Date(opp.applicationDeadline) : null;
    const daysUntil = deadline && Number.isFinite(deadline.getTime()) ? Math.floor((deadline.getTime() - Date.now()) / 86400000) : null;
    const urgency =
      daysUntil === null ? 'unknown'
        : daysUntil < 0 ? 'high'
          : daysUntil < 30 ? 'high'
            : daysUntil < 90 ? 'medium'
              : 'low';
    if (daysUntil !== null) reasons.push(`Deadline is ${daysUntil} days away (urgency: ${urgency}).`);

    const factorCoverage: GrantProspectMatch['factor_coverage'] = {
      program_area: nteeMatched || overlap > 0 ? 'MATCHED' : (hasAnyFocus ? 'NOT_MATCHED' : 'UNKNOWN'),
      geography: eligibleStates.length ? (geoMatched ? 'MATCHED' : 'NOT_MATCHED') : 'UNKNOWN',
      award_size: Number.isFinite(askAmount ?? NaN) ? (excluded.length ? 'NOT_MATCHED' : 'MATCHED') : 'UNKNOWN',
      funder_type: 'UNKNOWN',
      deadline: opp.applicationDeadline ? 'KNOWN' : 'UNKNOWN',
    };

    return {
      funder_name: opp.funderName,
      ...(opp.funderEIN ? { funder_ein: opp.funderEIN } : {}),
      opportunity_id: opp.id,
      program_name: opp.programName ?? '',
      match_score: Math.max(0, Math.min(100, Math.round(score))),
      match_reasons: reasons,
      excluded_reasons: excluded,
      factor_coverage: factorCoverage,
      deadline: {
        ...(opp.applicationDeadline ? { application_deadline: opp.applicationDeadline } : {}),
        rolling: Boolean(opp.isRollingDeadline),
        urgency,
      },
    };
  });

  const ranked = matches
    .filter(m => m.excluded_reasons.length === 0)
    .filter(m => m.match_score >= 50)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, input.maxResults);

  if (ranked.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      warnings: warnings.length ? warnings : ['No eligible matches found with available inputs and data coverage.'],
      data_basis: { source: 'none', notes: 'No ranked matches could be produced without producing misleading results.' },
      matches: [],
    };
  }

  return {
    status: 'OK',
    warnings,
    data_basis: { source: 'candid_api', notes: 'Ranked using deterministic scoring over opportunity eligibility + grant size + focus overlap. Funder type is not scored due to missing typed data.' },
    matches: ranked,
  };
}


import { z } from 'zod';

/**
 * 990 Narrative Intelligence (Wave 2 Feature 6)
 *
 * This module is intentionally strict and fail-closed:
 * - It refuses to generate if required source facts are missing.
 * - It validates LLM output against deterministic grounding rules.
 * - It returns explicit warnings and traceability metadata.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Contracts
// ─────────────────────────────────────────────────────────────────────────────

export const EvidenceSchema = z.object({
  /** Human-entered evidence note or citation pointer (not fetched). */
  note: z.string().min(1).max(2000),
  /** Optional URL string for internal traceability (not validated as reachable). */
  url: z.string().min(1).max(2000).optional(),
}).strict();

export const ProgramOutputMetricSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.number().finite().nonnegative(),
  unit: z.string().min(1).max(50),
}).strict();

export const ProgramInputSchema = z.object({
  programId: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(200),
  timePeriod: z.object({
    /** ISO date string (YYYY-MM-DD) */
    startDate: z.string().min(10).max(10),
    /** ISO date string (YYYY-MM-DD) */
    endDate: z.string().min(10).max(10),
  }).strict(),

  // Required factual inputs
  whatWeDo: z.string().min(50).max(5000),
  whoWeServe: z.string().min(20).max(2000),

  // Optional factual inputs
  whereWeOperate: z.string().min(2).max(2000).optional(),
  keyActivities: z.array(z.string().min(1).max(400)).max(20).optional(),
  keyPartners: z.array(z.string().min(1).max(200)).max(20).optional(),
  keyStaffOrVolunteers: z.array(z.string().min(1).max(200)).max(20).optional(),

  // Outputs are allowed as counts if provided
  outputs: z.array(ProgramOutputMetricSchema).max(30).optional(),

  /**
   * Outcomes (impact) are allowed only when evidence is provided.
   * This can be qualitative, but must have evidence notes attached.
   */
  outcomes: z.array(z.string().min(1).max(1000)).max(20).optional(),
  evidence: z.array(EvidenceSchema).max(20).optional(),
}).strict();

export const OrgNarrativeInputSchema = z.object({
  ein: z.string().min(9).max(15),
  orgName: z.string().min(1).max(200),
  missionStatement: z.string().min(10).max(2000).optional(),
}).strict();

export const NarrativeConstraintsSchema = z.object({
  tone: z.enum(['plain', 'formal', 'board_ready']).default('formal'),
  maxChars: z.number().int().min(400).max(8000).default(2400),
}).strict();

export const EvidencePolicySchema = z.object({
  /**
   * Minimum number of output metrics per program recommended.
   * If missing, we warn and may refuse depending on other weakness signals.
   */
  minOutputMetricsPerProgram: z.number().int().min(0).max(10).default(0),
  /** If outcomes are provided without evidence, refuse. */
  requireEvidenceForOutcomes: z.boolean().default(true),
  /** Minimum `whatWeDo` length; below this we refuse. */
  minWhatWeDoChars: z.number().int().min(30).max(500).default(80),
}).strict();

export const Form990NarrativeRequestSchema = z.object({
  org: OrgNarrativeInputSchema,
  programs: z.array(ProgramInputSchema).min(1).max(10),
  constraints: NarrativeConstraintsSchema.optional(),
  evidencePolicy: EvidencePolicySchema.optional(),
}).strict();

export type Form990NarrativeRequest = z.infer<typeof Form990NarrativeRequestSchema>;

export type NarrativeRefusalReason =
  | 'INSUFFICIENT_PROGRAM_DETAIL'
  | 'MISSING_TIME_PERIOD'
  | 'OUTCOMES_WITHOUT_EVIDENCE'
  | 'LLM_OUTPUT_NOT_JSON'
  | 'UNSUPPORTED_CLAIMS_DETECTED'
  | 'MODEL_REFUSED';

export const QualityHeuristicsSchema = z.object({
  score: z.number().int().min(0).max(100),
  breakdown: z.object({
    hasTimePeriod: z.boolean(),
    hasWhatWeDo: z.boolean(),
    hasWhoWeServe: z.boolean(),
    hasOutputs: z.boolean(),
    avoidsVagueClaims: z.boolean(),
    withinLength: z.boolean(),
  }).strict(),
}).strict();

export const Form990NarrativeResultSchema = z.object({
  refused: z.boolean(),
  refusal_reason: z.custom<NarrativeRefusalReason>().optional(),
  warnings: z.array(z.string().min(1).max(300)).default([]),
  narrative: z.string().default(''),
  source_input_summary: z.array(z.string().min(1).max(400)).default([]),
  traceability: z.array(z.object({
    program_name: z.string(),
    used_fields: z.array(z.string()),
  }).strict()).default([]),
  quality_score: QualityHeuristicsSchema.optional(),
}).strict();

export type Form990NarrativeResult = z.infer<typeof Form990NarrativeResultSchema>;

export type NarrativeLlm = (prompt: string) => Promise<{ text: string }>;

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class Form990NarrativeIntelligenceService {
  async generate(params: { input: Form990NarrativeRequest; llm: NarrativeLlm }): Promise<Form990NarrativeResult> {
    const parsed = Form990NarrativeRequestSchema.parse(params.input);
    const constraints = { tone: 'formal', maxChars: 2400, ...(parsed.constraints ?? {}) } as const;
    const policy = {
      minOutputMetricsPerProgram: 0,
      requireEvidenceForOutcomes: true,
      minWhatWeDoChars: 80,
      ...(parsed.evidencePolicy ?? {}),
    } as const;

    const pre = validateOrRefuse(parsed, policy);
    if (pre.refused) return pre;

    const prompt = buildGroundedPrompt(parsed, constraints, policy);

    const llmOut = await params.llm(prompt).catch((err) => {
      const msg = err instanceof Error ? err.message : 'MODEL_REFUSED';
      return { text: `__MODEL_ERROR__:${msg}` };
    });

    if (llmOut.text.startsWith('__MODEL_ERROR__')) {
      return {
        refused: true,
        refusal_reason: 'MODEL_REFUSED',
        warnings: ['Model invocation failed; refusing to generate narrative.'],
        narrative: '',
        source_input_summary: buildSourceSummary(parsed),
        traceability: [],
        quality_score: scoreQuality(parsed, '', constraints.maxChars),
      };
    }

    const grounded = postValidateAndAssemble(parsed, llmOut.text, constraints.maxChars);
    return grounded;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation, grounding, and scoring
// ─────────────────────────────────────────────────────────────────────────────

function validateOrRefuse(
  input: Form990NarrativeRequest,
  policy: z.infer<typeof EvidencePolicySchema>,
): Form990NarrativeResult {
  const warnings: string[] = [];

  for (const [idx, p] of input.programs.entries()) {
    if (!p.timePeriod?.startDate || !p.timePeriod?.endDate) {
      return refuse('MISSING_TIME_PERIOD', ['Program time period is required for 990 narratives.'], input);
    }

    if (p.whatWeDo.trim().length < policy.minWhatWeDoChars) {
      return refuse(
        'INSUFFICIENT_PROGRAM_DETAIL',
        [`Program "${p.name}" is missing sufficient detail in whatWeDo (minimum ${policy.minWhatWeDoChars} characters).`],
        input,
      );
    }

    if (policy.requireEvidenceForOutcomes && Array.isArray(p.outcomes) && p.outcomes.length > 0) {
      const evidenceCount = Array.isArray(p.evidence) ? p.evidence.length : 0;
      if (evidenceCount <= 0) {
        return refuse(
          'OUTCOMES_WITHOUT_EVIDENCE',
          [`Program "${p.name}" lists outcomes without evidence; refusing to avoid unsupported impact claims.`],
          input,
        );
      }
    }

    const outputsCount = Array.isArray(p.outputs) ? p.outputs.length : 0;
    if (policy.minOutputMetricsPerProgram > 0 && outputsCount < policy.minOutputMetricsPerProgram) {
      warnings.push(
        `Program "${p.name}" has only ${outputsCount} output metrics; consider adding counts to strengthen the narrative.`,
      );
    }

    // Light warning if placeholders appear in inputs
    const weakSignals = ['various', 'many', 'numerous', 'helped a lot', 'significant impact'];
    const blob = `${p.whatWeDo} ${p.whoWeServe}`.toLowerCase();
    if (weakSignals.some(s => blob.includes(s))) {
      warnings.push(`Program "${p.name}" contains vague language; narrative may be weak without concrete outputs.`);
    }

    // Cap to avoid spam
    if (warnings.length > 20) break;
    void idx;
  }

  return {
    refused: false,
    warnings,
    narrative: '',
    source_input_summary: buildSourceSummary(input),
    traceability: [],
    quality_score: scoreQuality(input, '', input.constraints?.maxChars ?? 2400),
  };
}

function refuse(
  reason: NarrativeRefusalReason,
  warnings: string[],
  input: Form990NarrativeRequest,
): Form990NarrativeResult {
  return {
    refused: true,
    refusal_reason: reason,
    warnings,
    narrative: '',
    source_input_summary: buildSourceSummary(input),
    traceability: [],
    quality_score: scoreQuality(input, '', input.constraints?.maxChars ?? 2400),
  };
}

function buildSourceSummary(input: Form990NarrativeRequest): string[] {
  const out: string[] = [];
  out.push(`Org: ${input.org.orgName} (EIN: ${input.org.ein})`);
  if (input.org.missionStatement) out.push(`Mission: ${truncate(input.org.missionStatement, 220)}`);
  for (const p of input.programs) {
    out.push(`Program: ${p.name} (${p.timePeriod.startDate} to ${p.timePeriod.endDate})`);
    out.push(`- whatWeDo: ${truncate(p.whatWeDo, 220)}`);
    out.push(`- whoWeServe: ${truncate(p.whoWeServe, 180)}`);
    if (p.whereWeOperate) out.push(`- whereWeOperate: ${truncate(p.whereWeOperate, 140)}`);
    if (p.outputs && p.outputs.length > 0) {
      out.push(`- outputs: ${p.outputs.map(m => `${m.label}=${m.value} ${m.unit}`).join('; ')}`.slice(0, 380));
    }
    if (p.outcomes && p.outcomes.length > 0) {
      out.push(`- outcomes: ${p.outcomes.map(x => truncate(x, 120)).join('; ')}`.slice(0, 380));
    }
    if (p.evidence && p.evidence.length > 0) {
      out.push(`- evidence_notes: ${p.evidence.length}`);
    }
  }
  return out;
}

function buildGroundedPrompt(
  input: Form990NarrativeRequest,
  constraints: z.infer<typeof NarrativeConstraintsSchema>,
  policy: z.infer<typeof EvidencePolicySchema>,
): string {
  const allowedNumbers = collectAllowedNumbers(input);

  const facts = {
    org: input.org,
    programs: input.programs.map(p => ({
      programId: p.programId ?? null,
      name: p.name,
      timePeriod: p.timePeriod,
      whatWeDo: p.whatWeDo,
      whoWeServe: p.whoWeServe,
      whereWeOperate: p.whereWeOperate ?? null,
      keyActivities: p.keyActivities ?? [],
      keyPartners: p.keyPartners ?? [],
      keyStaffOrVolunteers: p.keyStaffOrVolunteers ?? [],
      outputs: p.outputs ?? [],
      outcomes: p.outcomes ?? [],
      evidence: p.evidence ?? [],
    })),
    constraints,
    policy,
  };

  return [
    'You are Magnus Accord 990 Narrative Intelligence.',
    'Task: Draft Form 990 Part III-style program/service accomplishment narratives.',
    '',
    'GROUNDING RULES (MUST FOLLOW):',
    '- Use ONLY the facts in the JSON below. Do not add any facts, numbers, beneficiaries, outcomes, or statistics not present.',
    '- If information is missing, OMIT it or explicitly mark it as "not provided" in the JSON traceability fields.',
    '- Do NOT claim impact/outcomes unless outcomes are provided AND evidence notes exist for that program.',
    `- Do NOT introduce ANY numbers not in this allowed set: ${JSON.stringify(Array.from(allowedNumbers).sort())}`,
    '- No superlatives like "transformative" unless supported by provided evidence.',
    '',
    'OUTPUT FORMAT (STRICT):',
    'Return ONLY valid JSON (no markdown) matching this shape:',
    '{ "program_narratives": [ { "program_name": string, "narrative": string, "used_fields": string[] } ], "overall_notes": string, "warnings": string[] }',
    '',
    'The narrative must be plain, public-facing, and suitable for Form 990. Keep it factual.',
    `Character budget: <= ${constraints.maxChars}.`,
    '',
    'SOURCE_FACTS_JSON:',
    JSON.stringify(facts, null, 2),
    '',
  ].join('\n');
}

function postValidateAndAssemble(
  input: Form990NarrativeRequest,
  llmText: string,
  maxChars: number,
): Form990NarrativeResult {
  const allowedNumbers = collectAllowedNumbers(input);

  let json: any;
  try {
    json = JSON.parse(llmText);
  } catch {
    return refuse('LLM_OUTPUT_NOT_JSON', ['Model output was not valid JSON; refusing to avoid ungrounded narrative.'], input);
  }

  const programNarratives = Array.isArray(json?.program_narratives) ? json.program_narratives : [];
  if (programNarratives.length === 0) {
    return refuse('LLM_OUTPUT_NOT_JSON', ['Model did not return program_narratives; refusing.'], input);
  }

  // Assemble narrative in a deterministic format.
  const blocks: string[] = [];
  const traceability: Array<{ program_name: string; used_fields: string[] }> = [];
  const warnings: string[] = Array.isArray(json?.warnings) ? json.warnings.map(String).slice(0, 20) : [];

  for (const item of programNarratives) {
    const programName = String(item?.program_name ?? '').trim();
    const narrative = String(item?.narrative ?? '').trim();
    const usedFields = Array.isArray(item?.used_fields) ? item.used_fields.map(String) : [];

    if (!programName || !narrative) {
      return refuse('UNSUPPORTED_CLAIMS_DETECTED', ['Model returned empty narrative fields; refusing.'], input);
    }

    // Guard: numbers in narrative must be allowed.
    const numbersInText = extractNumbers(narrative);
    for (const n of numbersInText) {
      if (!allowedNumbers.has(n)) {
        return refuse(
          'UNSUPPORTED_CLAIMS_DETECTED',
          [`Model introduced unsupported number "${n}" in program "${programName}".`],
          input,
        );
      }
    }

    // Guard: outcome-like phrases require outcomes+evidence in source input.
    if (looksLikeOutcomeClaim(narrative)) {
      const src = input.programs.find(p => p.name === programName);
      const ok = Boolean(src && Array.isArray(src.outcomes) && src.outcomes.length > 0 && Array.isArray(src.evidence) && src.evidence.length > 0);
      if (!ok) {
        return refuse(
          'UNSUPPORTED_CLAIMS_DETECTED',
          [`Model produced outcome/impact claims for "${programName}" without outcomes+evidence in inputs.`],
          input,
        );
      }
    }

    blocks.push(`${programName}: ${narrative}`);
    traceability.push({ program_name: programName, used_fields: usedFields });
  }

  const full = blocks.join('\n\n').trim();
  if (full.length > maxChars) {
    warnings.push(`Narrative exceeded max length (${maxChars}); content may need trimming.`);
  }

  return {
    refused: false,
    warnings,
    narrative: full.slice(0, Math.max(maxChars, 200)),
    source_input_summary: buildSourceSummary(input),
    traceability,
    quality_score: scoreQuality(input, full, maxChars),
  };
}

function scoreQuality(input: Form990NarrativeRequest, narrative: string, maxChars: number) {
  const hasTimePeriod = input.programs.every(p => Boolean(p.timePeriod?.startDate && p.timePeriod?.endDate));
  const hasWhatWeDo = input.programs.every(p => p.whatWeDo.trim().length >= 50);
  const hasWhoWeServe = input.programs.every(p => p.whoWeServe.trim().length >= 20);
  const hasOutputs = input.programs.some(p => Array.isArray(p.outputs) && p.outputs.length > 0);
  const avoidsVagueClaims = !looksLikeOutcomeClaim(narrative);
  const withinLength = narrative.length === 0 ? true : narrative.length <= maxChars;

  const points =
    (hasTimePeriod ? 20 : 0) +
    (hasWhatWeDo ? 20 : 0) +
    (hasWhoWeServe ? 20 : 0) +
    (hasOutputs ? 15 : 0) +
    (avoidsVagueClaims ? 15 : 0) +
    (withinLength ? 10 : 0);

  return {
    score: Math.max(0, Math.min(100, points)),
    breakdown: { hasTimePeriod, hasWhatWeDo, hasWhoWeServe, hasOutputs, avoidsVagueClaims, withinLength },
  };
}

function looksLikeOutcomeClaim(text: string): boolean {
  const s = text.toLowerCase();
  const phrases = [
    'increased by',
    'decreased by',
    'reduced',
    'improved',
    'impact',
    'outcome',
    '%',
    'percent',
    'resulted in',
    'led to',
    'successfully',
    'demonstrated',
  ];
  return phrases.some(p => s.includes(p));
}

function extractNumbers(text: string): string[] {
  // Extract digit sequences including commas/decimals (e.g., 1,234 or 12.5)
  const matches = text.match(/\\b\\d[\\d,]*(?:\\.\\d+)?\\b/g);
  return matches ? matches.map(m => m.replace(/,/g, '')) : [];
}

function collectAllowedNumbers(input: Form990NarrativeRequest): Set<string> {
  const out = new Set<string>();
  for (const p of input.programs) {
    if (Array.isArray(p.outputs)) {
      for (const m of p.outputs) out.add(String(m.value));
    }
    out.add(String(parseInt(p.timePeriod.startDate.slice(0, 4), 10)));
    out.add(String(parseInt(p.timePeriod.endDate.slice(0, 4), 10)));
  }
  return out;
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\\s+/g, ' ');
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}


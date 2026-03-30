import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Contracts (v1)
// ─────────────────────────────────────────────────────────────────────────────

export const EvidenceSchema = z.object({
  note: z.string().min(1).max(2000),
  url: z.string().min(1).max(2000).optional(),
}).strict();

export const OutputMetricSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.number().finite().nonnegative(),
  unit: z.string().min(1).max(50),
}).strict();

export const LoiOrgSchema = z.object({
  name: z.string().min(1).max(200),
  ein: z.string().min(9).max(15),
  mission: z.string().min(10).max(2000).optional(),
  yearsOperating: z.number().int().min(0).max(250).optional(),
  contactName: z.string().min(1).max(200).optional(),
  contactEmail: z.string().min(3).max(200).optional(),
}).strict();

export const LoiProgramSchema = z.object({
  name: z.string().min(1).max(200),
  summary: z.string().min(80).max(5000),
  serviceArea: z.string().min(2).max(2000),
  whoWeServe: z.string().min(10).max(2000).optional(),
  keyActivities: z.array(z.string().min(1).max(400)).max(25).optional(),
  outputs: z.array(OutputMetricSchema).max(30).optional(),
  outcomes: z.array(z.string().min(1).max(1000)).max(20).optional(),
  evidence: z.array(EvidenceSchema).max(20).optional(),
}).strict();

export const LoiAskSchema = z.object({
  amountUsd: z.number().finite().positive().max(100_000_000),
  intendedUseOfFunds: z.string().min(30).max(2000),
  timeframe: z.string().min(1).max(200).optional(),
}).strict();

export const FunderProfileSchema = z.object({
  funderName: z.string().min(1).max(200),
  priorities: z.array(z.string().min(1).max(300)).min(1).max(20),
  constraints: z.array(z.string().min(1).max(300)).max(20).optional(),
  evidence: z.array(EvidenceSchema).min(1).max(20),
}).strict();

export const LoiFunderSchema = z.discriminatedUnion('profileProvided', [
  z.object({
    profileProvided: z.literal(true),
    profile: FunderProfileSchema,
  }).strict(),
  z.object({
    profileProvided: z.literal(false),
  }).strict(),
]);

export const LoiConstraintsSchema = z.object({
  tone: z.enum(['professional', 'formal']).default('professional'),
  maxChars: z.number().int().min(800).max(8000).default(3200),
  /**
   * If true, LOI must include a funder-fit section; refuse if funder profile missing.
   * If false, generate reduced-scope LOI without “fit” section and warn.
   */
  requireFunderFit: z.boolean().default(true),
}).strict();

export const LoiRequestSchema = z.object({
  org: LoiOrgSchema,
  program: LoiProgramSchema,
  ask: LoiAskSchema,
  funder: LoiFunderSchema,
  constraints: LoiConstraintsSchema.optional(),
}).strict();

export type LoiRequest = z.infer<typeof LoiRequestSchema>;

export type LoiRefusalReason =
  | 'INSUFFICIENT_PROGRAM_DETAIL'
  | 'MISSING_ASK_AMOUNT'
  | 'MISSING_INTENDED_USE'
  | 'FUNDER_PROFILE_REQUIRED'
  | 'OUTCOMES_WITHOUT_EVIDENCE'
  | 'LLM_OUTPUT_NOT_JSON'
  | 'UNSUPPORTED_CLAIMS_DETECTED'
  | 'MODEL_REFUSED';

export type LoiSection = 'intro' | 'org' | 'program' | 'ask' | 'fit' | 'closing';

export const LoiResultSchema = z.object({
  refused: z.boolean(),
  refusal_reason: z.custom<LoiRefusalReason>().optional(),
  warnings: z.array(z.string().min(1).max(300)).default([]),
  loi_draft: z.string().default(''),
  grounding: z.array(z.object({
    section: z.custom<LoiSection>(),
    used_fields: z.array(z.string().min(1)).default([]),
    notes: z.string().max(600).optional(),
  }).strict()).default([]),
  facts_vs_phrasing: z.object({
    facts_used: z.array(z.string().min(1).max(400)).default([]),
    generated_phrasing_only: z.array(z.string().min(1).max(400)).default([]),
  }).strict(),
}).strict();

export type LoiResult = z.infer<typeof LoiResultSchema>;

export type LoiLlm = (prompt: string) => Promise<{ text: string }>;

// ─────────────────────────────────────────────────────────────────────────────
// Service (v1)
// ─────────────────────────────────────────────────────────────────────────────

export class LoiGeneratorService {
  async generate(params: { input: LoiRequest; llm: LoiLlm }): Promise<LoiResult> {
    const parsed = LoiRequestSchema.parse(params.input);
    const constraints = LoiConstraintsSchema.parse(parsed.constraints ?? {});

    const pre = validateOrRefuse(parsed, constraints);
    if (pre.refused) return pre;

    const prompt = buildGroundedPrompt(parsed, constraints);

    const llmOut = await params.llm(prompt).catch((err) => {
      const msg = err instanceof Error ? err.message : 'MODEL_REFUSED';
      return { text: `__MODEL_ERROR__:${msg}` };
    });

    if (llmOut.text.startsWith('__MODEL_ERROR__')) {
      return refuse(parsed, constraints, 'MODEL_REFUSED', ['Model invocation failed; refusing to generate LOI.']);
    }

    return postValidateAndAssemble(parsed, constraints, llmOut.text);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grounding / refusal logic
// ─────────────────────────────────────────────────────────────────────────────

function validateOrRefuse(input: LoiRequest, constraints: z.infer<typeof LoiConstraintsSchema>) {
  const warnings: string[] = [];

  if (!Number.isFinite(input.ask.amountUsd) || input.ask.amountUsd <= 0) {
    return refuse(input, constraints, 'MISSING_ASK_AMOUNT', ['Ask amount is required.']);
  }
  if (!input.ask.intendedUseOfFunds || input.ask.intendedUseOfFunds.trim().length < 30) {
    return refuse(input, constraints, 'MISSING_INTENDED_USE', ['Intended use of funds is required (minimum detail).']);
  }

  if (input.program.summary.trim().length < 80) {
    return refuse(input, constraints, 'INSUFFICIENT_PROGRAM_DETAIL', ['Program summary is too weak; refusing to avoid vague LOI.']);
  }

  if (Array.isArray(input.program.outcomes) && input.program.outcomes.length > 0) {
    const ev = Array.isArray(input.program.evidence) ? input.program.evidence.length : 0;
    if (ev <= 0) {
      return refuse(input, constraints, 'OUTCOMES_WITHOUT_EVIDENCE', ['Outcomes provided without evidence; refusing to avoid unsupported impact claims.']);
    }
  }

  if (constraints.requireFunderFit && input.funder.profileProvided === false) {
    return refuse(input, constraints, 'FUNDER_PROFILE_REQUIRED', ['Funder profile/priorities are required for a tailored LOI.']);
  }

  if (!constraints.requireFunderFit && input.funder.profileProvided === false) {
    warnings.push('Funder profile not provided; LOI will omit the tailored funder-fit section.');
  }

  return {
    refused: false,
    warnings,
    loi_draft: '',
    grounding: [],
    facts_vs_phrasing: {
      facts_used: buildFactsUsed(input, constraints),
      generated_phrasing_only: [],
    },
  } satisfies LoiResult;
}

function refuse(input: LoiRequest, constraints: z.infer<typeof LoiConstraintsSchema>, reason: LoiRefusalReason, warnings: string[]): LoiResult {
  return {
    refused: true,
    refusal_reason: reason,
    warnings,
    loi_draft: '',
    grounding: [],
    facts_vs_phrasing: {
      facts_used: buildFactsUsed(input, constraints),
      generated_phrasing_only: [],
    },
  };
}

function buildFactsUsed(input: LoiRequest, constraints: z.infer<typeof LoiConstraintsSchema>): string[] {
  const out: string[] = [];
  out.push(`Organization: ${input.org.name} (EIN: ${input.org.ein})`);
  if (input.org.mission) out.push(`Mission: ${truncate(input.org.mission, 220)}`);
  out.push(`Program: ${input.program.name}`);
  out.push(`Service area: ${truncate(input.program.serviceArea, 140)}`);
  out.push(`Program summary: ${truncate(input.program.summary, 260)}`);
  out.push(`Ask: $${Math.round(input.ask.amountUsd).toLocaleString('en-US')}`);
  out.push(`Intended use of funds: ${truncate(input.ask.intendedUseOfFunds, 220)}`);
  if (input.funder.profileProvided) {
    out.push(`Funder: ${input.funder.profile.funderName}`);
    out.push(`Funder priorities: ${input.funder.profile.priorities.slice(0, 6).join('; ')}`.slice(0, 380));
  } else if (!constraints.requireFunderFit) {
    out.push('Funder: not provided (fit section omitted)');
  }
  return out;
}

function buildGroundedPrompt(input: LoiRequest, constraints: z.infer<typeof LoiConstraintsSchema>): string {
  const allowedNumbers = collectAllowedNumbers(input);
  const wantsFit = constraints.requireFunderFit && input.funder.profileProvided === true;

  const source = {
    org: input.org,
    program: input.program,
    ask: input.ask,
    funder: input.funder,
    constraints: { ...constraints, includeFitSection: wantsFit },
  };

  return [
    'You are Magnus Accord LOI Generator.',
    'Task: Draft a foundation-ready Letter of Inquiry (LOI) using only provided inputs.',
    '',
    'GROUNDING RULES (MUST FOLLOW):',
    '- Use ONLY facts in SOURCE_FACTS_JSON. Do not invent outcomes, years operating, budget, history, partners, or funder priorities.',
    `- Do NOT introduce ANY numbers not in this allowed set: ${JSON.stringify(Array.from(allowedNumbers).sort())}`,
    '- Avoid outcome/impact claims unless outcomes are provided AND evidence notes exist.',
    '- If funder profile is missing and includeFitSection is false, OMIT the funder-fit section and add a warning.',
    '',
    'OUTPUT FORMAT (STRICT JSON ONLY):',
    '{',
    '  \"sections\": {',
    '    \"intro\": { \"text\": string, \"used_fields\": string[] },',
    '    \"org\": { \"text\": string, \"used_fields\": string[] },',
    '    \"program\": { \"text\": string, \"used_fields\": string[] },',
    '    \"ask\": { \"text\": string, \"used_fields\": string[] },',
    '    \"fit\": { \"text\": string, \"used_fields\": string[], \"omitted\": boolean },',
    '    \"closing\": { \"text\": string, \"used_fields\": string[] }',
    '  },',
    '  \"warnings\": string[],',
    '  \"generated_phrasing_only\": string[]',
    '}',
    '',
    `Length target: <= ${constraints.maxChars} characters total across section texts.`,
    '',
    'SOURCE_FACTS_JSON:',
    JSON.stringify(source, null, 2),
    '',
  ].join('\\n');
}

function postValidateAndAssemble(input: LoiRequest, constraints: z.infer<typeof LoiConstraintsSchema>, llmText: string): LoiResult {
  let json: any;
  try {
    json = JSON.parse(llmText);
  } catch {
    return refuse(input, constraints, 'LLM_OUTPUT_NOT_JSON', ['Model output was not valid JSON; refusing to avoid ungrounded LOI.']);
  }

  const sections = json?.sections ?? {};
  const warnings: string[] = Array.isArray(json?.warnings) ? json.warnings.map(String).slice(0, 20) : [];
  const phrasing: string[] = Array.isArray(json?.generated_phrasing_only) ? json.generated_phrasing_only.map(String).slice(0, 30) : [];

  const parts: Array<{ section: LoiSection; text: string; used_fields: string[]; omitted?: boolean }> = [
    { section: 'intro', ...(sections.intro ?? {}) },
    { section: 'org', ...(sections.org ?? {}) },
    { section: 'program', ...(sections.program ?? {}) },
    { section: 'ask', ...(sections.ask ?? {}) },
    { section: 'fit', ...(sections.fit ?? {}) },
    { section: 'closing', ...(sections.closing ?? {}) },
  ].map((p: any) => ({
    section: p.section,
    text: String(p.text ?? '').trim(),
    used_fields: Array.isArray(p.used_fields) ? p.used_fields.map(String) : [],
    omitted: Boolean(p.omitted),
  }));

  // Basic required content checks
  for (const p of parts) {
    if (p.section === 'fit' && constraints.requireFunderFit === false) {
      // fit may be omitted
      continue;
    }
    if (!p.text) {
      return refuse(input, constraints, 'UNSUPPORTED_CLAIMS_DETECTED', [`Model returned empty section: ${p.section}`]);
    }
  }

  // Guard: no unsupported numbers.
  const allowedNumbers = collectAllowedNumbers(input);
  const allText = parts.map(p => p.text).join('\\n');
  for (const n of extractNumbers(allText)) {
    if (!allowedNumbers.has(n)) {
      return refuse(input, constraints, 'UNSUPPORTED_CLAIMS_DETECTED', [`Model introduced unsupported number \"${n}\".`]);
    }
  }

  // Guard: outcome-like language requires outcomes+evidence.
  if (looksLikeOutcomeClaim(allText)) {
    const ok = Array.isArray(input.program.outcomes) && input.program.outcomes.length > 0 && Array.isArray(input.program.evidence) && input.program.evidence.length > 0;
    if (!ok) {
      return refuse(input, constraints, 'UNSUPPORTED_CLAIMS_DETECTED', ['Model produced outcome/impact claims without outcomes+evidence in inputs.']);
    }
  }

  // If funder missing and reduced scope, ensure fit omitted and warn.
  if (input.funder.profileProvided === false && constraints.requireFunderFit === false) {
    const fit = parts.find(p => p.section === 'fit');
    if (fit && !fit.omitted) {
      warnings.push('Funder fit section was expected to be omitted due to missing profile; review output.');
    }
    if (!warnings.some(w => w.toLowerCase().includes('funder profile'))) {
      warnings.push('Funder profile not provided; LOI is not tailored to specific priorities.');
    }
  }

  const draft = parts
    .filter(p => !(p.section === 'fit' && p.omitted))
    .map(p => `${titleCase(p.section)}\\n${p.text}`.trim())
    .join('\\n\\n')
    .slice(0, Math.max(constraints.maxChars, 800));

  return {
    refused: false,
    warnings,
    loi_draft: draft,
    grounding: parts.map(p => ({
      section: p.section,
      used_fields: p.used_fields,
      ...(p.section === 'fit' && p.omitted ? { notes: 'Fit section omitted due to missing/weak funder profile.' } : {}),
    })),
    facts_vs_phrasing: {
      facts_used: buildFactsUsed(input, constraints),
      generated_phrasing_only: phrasing,
    },
  };
}

function collectAllowedNumbers(input: LoiRequest): Set<string> {
  const out = new Set<string>();
  out.add(String(Math.round(input.ask.amountUsd)));
  if (Array.isArray(input.program.outputs)) {
    for (const m of input.program.outputs) out.add(String(m.value));
  }
  return out;
}

function extractNumbers(text: string): string[] {
  const matches = text.match(/\\b\\d[\\d,]*(?:\\.\\d+)?\\b/g);
  return matches ? matches.map(m => m.replace(/,/g, '')) : [];
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
    'demonstrated',
  ];
  return phrases.some(p => s.includes(p));
}

function titleCase(section: LoiSection): string {
  if (section === 'org') return 'Organization';
  if (section === 'program') return 'Program';
  if (section === 'ask') return 'Funding Request';
  if (section === 'fit') return 'Funder Fit';
  if (section === 'intro') return 'Introduction';
  return 'Closing';
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\\s+/g, ' ');
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}


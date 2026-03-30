import type { FeatureKey } from './features';

/** Feature keys that may appear on `PartnerProgram.enabledFeatures`. Excludes `institutional_partner` (billing-org only). */
export const PROGRAM_ENABLED_FEATURE_KEYS: readonly FeatureKey[] = [
  'compliance_calendar',
  'grant_generator',
  'claude_partner',
  'worker_financial_layer',
  'agents_layer',
] as const;

const KEY_SET = new Set<string>(PROGRAM_ENABLED_FEATURE_KEYS);

export class ProgramFeatureParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramFeatureParseError';
  }
}

const MAX_PROGRAM_FEATURE_ENTRIES = 24;

/** Validate and dedupe enabled feature keys for institutional partner programs. */
export function parseProgramEnabledFeatures(raw: unknown): FeatureKey[] {
  if (!Array.isArray(raw)) {
    throw new ProgramFeatureParseError('enabledFeatures_must_be_array');
  }
  const out: FeatureKey[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string' || !KEY_SET.has(x)) {
      throw new ProgramFeatureParseError('enabledFeatures_invalid_key');
    }
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x as FeatureKey);
    if (out.length > MAX_PROGRAM_FEATURE_ENTRIES) {
      throw new ProgramFeatureParseError('enabledFeatures_too_many');
    }
  }
  return out;
}

/**
 * Executive rollup vocabulary: explicit module state is derived deterministically from
 * coverage + section summaries. Do not treat OK as "verified compliance" — only "no weak
 * signals in this rollup pass."
 */

export type SectionCoverage = 'ok' | 'weak' | 'unavailable';

/** Per-module truth label for the control tower UI. */
export type ExecutiveModuleState =
  | 'OK'
  | 'WEAK_COVERAGE'
  | 'INSUFFICIENT_DATA'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE_FEATURE'
  /** Partner JWT / portfolio console only — not computable from org token alone. */
  | 'NOT_APPLICABLE_ORG_CONTEXT';

export type ExecutiveSectionInput = {
  coverage: SectionCoverage;
  source: string;
  dashboardHref: string;
  summary: Record<string, unknown>;
  unavailableReason?: string;
};

export type ExecutiveSection = ExecutiveSectionInput & {
  moduleState: ExecutiveModuleState;
};

export type ExecutiveAlertEvidence = {
  kind: 'rollup_field';
  /** Dot path into the executive section payload, e.g. "summary.blockedCount" */
  path: string;
};

/** Rule-based signals only — no LLM, no cross-module scoring. */
export type ExecutiveAlert = {
  id: string;
  severity: 'high' | 'medium' | 'info';
  message: string;
  /** Section key, e.g. auditPrep */
  sourceModule: string;
  dashboardHref: string;
  evidence: ExecutiveAlertEvidence;
  confidence: 'deterministic';
};

export const EXECUTIVE_ALERTS_MAX = 20;

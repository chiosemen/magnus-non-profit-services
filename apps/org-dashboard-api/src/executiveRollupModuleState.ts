import type { ExecutiveModuleState, ExecutiveSection, ExecutiveSectionInput, SectionCoverage } from './executiveRollupTypes';

/**
 * Maps legacy coverage + module-specific summary fields to ExecutiveModuleState.
 *
 * - UNAVAILABLE_FEATURE: subscription gate or missing org row where no finer donor/volunteer state applies.
 * - NOT_CONFIGURED: donor/volunteer ledger explicitly empty (data status enums).
 * - INSUFFICIENT_DATA: module returned thin/invalid inputs (990, cash flow, donor/volunteer insufficient).
 * - WEAK_COVERAGE: heuristic weak (e.g. zero records) or operational risk without insufficient_data enum.
 * - NOT_APPLICABLE_ORG_CONTEXT: institutional portfolio (partner auth only).
 */
export function computeModuleState(sectionKey: string, sec: ExecutiveSectionInput): ExecutiveModuleState {
  if (sectionKey === 'institutionalPortfolio') {
    return 'NOT_APPLICABLE_ORG_CONTEXT';
  }

  const { coverage, summary, unavailableReason } = sec;

  if (coverage === 'unavailable') {
    if (sectionKey === 'donorOperations' && summary['donorDataStatus'] === 'NOT_CONFIGURED') {
      return 'NOT_CONFIGURED';
    }
    if (sectionKey === 'volunteerOperations' && summary['volunteerDataStatus'] === 'NOT_CONFIGURED') {
      return 'NOT_CONFIGURED';
    }
    if (unavailableReason?.includes('not enabled')) {
      return 'UNAVAILABLE_FEATURE';
    }
    if (sectionKey === 'form990Readiness' && unavailableReason?.toLowerCase().includes('not found')) {
      return 'INSUFFICIENT_DATA';
    }
    return 'UNAVAILABLE_FEATURE';
  }

  if (coverage === 'weak') {
    if (sectionKey === 'donorOperations' && summary['donorDataStatus'] === 'INSUFFICIENT_DATA') {
      return 'INSUFFICIENT_DATA';
    }
    if (sectionKey === 'volunteerOperations' && summary['volunteerDataStatus'] === 'INSUFFICIENT_DATA') {
      return 'INSUFFICIENT_DATA';
    }
    if (sectionKey === 'form990Readiness' && summary['status'] === 'insufficient_data') {
      return 'INSUFFICIENT_DATA';
    }
    if (sectionKey === 'cashFlow' && summary['status'] === 'insufficient_data') {
      return 'INSUFFICIENT_DATA';
    }
    return 'WEAK_COVERAGE';
  }

  return 'OK';
}

/** Attach moduleState to each section (pure). */
export function enrichSectionsWithModuleState(sections: Record<string, ExecutiveSectionInput>): Record<string, ExecutiveSection> {
  const out: Record<string, ExecutiveSection> = {};
  for (const [key, sec] of Object.entries(sections)) {
    out[key] = { ...sec, moduleState: computeModuleState(key, sec) };
  }
  return out;
}

export function coverageFromCounts(count: number): SectionCoverage {
  return count > 0 ? 'ok' : 'weak';
}

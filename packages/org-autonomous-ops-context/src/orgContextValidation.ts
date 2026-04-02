import type { OrgContextFileKind } from '@magnus/db/types';
import { ORG_CONTEXT_FILE_KINDS } from './kinds';
import { hasMagnusTemplateMarker } from './orgContextTemplateMarkers';
import { parseOrgIdentityForGrantProfile } from './orgIdentityParsers/grantProfile';

export type OrgContextConfiguredState =
  | 'missing_row'
  | 'template_unedited'
  | 'edited_incomplete'
  | 'ready';

/** Aligns with pilot readiness vocabulary. */
export type OrgContextKindStatus = 'NOT_CONFIGURED' | 'PARTIAL' | 'READY';

export type OrgContextFileReportRow = {
  kind: OrgContextFileKind;
  /** Human-readable label */
  label: string;
  purpose: string;
  whatBreaksIfMissing: string;
  requiredForPilot: 'required' | 'recommended';
  status: OrgContextKindStatus;
  configuredState: OrgContextConfiguredState;
  blockers: string[];
  warnings: string[];
};

export type OrgContextValidationReport = {
  orgId: string;
  asOfIso: string;
  expectedKinds: readonly OrgContextFileKind[];
  rows: OrgContextFileReportRow[];
  grantProfileMissingCodes: string[];
  operatorActions: string[];
};

const KIND_META: Record<
  OrgContextFileKind,
  { label: string; purpose: string; whatBreaksIfMissing: string; requiredForPilot: 'required' | 'recommended' }
> = {
  ORG_IDENTITY: {
    label: 'Org identity',
    purpose: 'Legal/org facts, mission, sector, footprint — source for grant matching and executive surfaces.',
    whatBreaksIfMissing:
      'GrantIntelligenceHerald cannot match opportunities; executive readiness treats identity as incomplete.',
    requiredForPilot: 'required',
  },
  ORG_SOUL: {
    label: 'Org soul (voice)',
    purpose: 'Tone, values, red lines for internal drafts and agent-generated copy.',
    whatBreaksIfMissing: 'Drafts may be generic or misaligned with org voice.',
    requiredForPilot: 'recommended',
  },
  ORG_AGENTS: {
    label: 'Agents & workflows',
    purpose: 'Which agents run, schedules, escalation — operator intent for autonomy.',
    whatBreaksIfMissing: 'Harder to audit which automation is intended vs accidental.',
    requiredForPilot: 'recommended',
  },
  ORG_MEMORY: {
    label: 'Curated org memory',
    purpose: 'Durable lessons (not raw logs) for retrieval and reflection.',
    whatBreaksIfMissing: 'Repeated mistakes; weaker curated recall.',
    requiredForPilot: 'recommended',
  },
  ORG_HEARTBEAT: {
    label: 'Heartbeat / cadence',
    purpose: 'Expected check cadence and escalation triggers.',
    whatBreaksIfMissing: 'Scheduling expectations unclear to operators and agents.',
    requiredForPilot: 'recommended',
  },
};

/** Minimum prose characters when `magnus:template` marker was removed. */
const MIN_NON_IDENTITY_BODY_CHARS = 80;
/** If the template marker is kept, require this much prose before READY (avoids false green on seeded bullets). */
const MIN_NON_IDENTITY_BODY_CHARS_WITH_TEMPLATE_MARKER = 200;

function stripForProseCount(md: string): string {
  return md
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith('#')) return false;
      if (t.startsWith('|')) return false;
      if (t.startsWith('<!--') && t.endsWith('-->')) return false;
      if (t.startsWith('<!--')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function statusFromConfigured(
  state: OrgContextConfiguredState,
  required: 'required' | 'recommended',
): { status: OrgContextKindStatus } {
  if (state === 'missing_row') return { status: required === 'required' ? 'NOT_CONFIGURED' : 'NOT_CONFIGURED' };
  if (state === 'template_unedited') return { status: 'PARTIAL' };
  if (state === 'edited_incomplete') return { status: 'PARTIAL' };
  return { status: 'READY' };
}

function evaluateOrgIdentity(
  content: string,
  annualRevenueUsdSnapshot: number | null,
): {
  configuredState: OrgContextConfiguredState;
  blockers: string[];
  warnings: string[];
  grantMissing: string[];
} {
  const grant = parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: content, annualRevenueUsdSnapshot });

  if (grant.profile) {
    return { configuredState: 'ready', blockers: [], warnings: grant.warnings, grantMissing: [] };
  }

  const blockers = grant.missing.length ? grant.missing : ['grant_profile_incomplete'];

  if (hasMagnusTemplateMarker(content)) {
    return {
      configuredState: 'template_unedited',
      blockers,
      warnings: grant.warnings,
      grantMissing: grant.missing,
    };
  }

  return {
    configuredState: 'edited_incomplete',
    blockers,
    warnings: grant.warnings,
    grantMissing: grant.missing,
  };
}

function evaluateNonIdentity(_kind: OrgContextFileKind, content: string): { configuredState: OrgContextConfiguredState; blockers: string[] } {
  const prose = stripForProseCount(content);
  const marker = hasMagnusTemplateMarker(content);

  if (marker) {
    if (prose.length >= MIN_NON_IDENTITY_BODY_CHARS_WITH_TEMPLATE_MARKER) {
      return { configuredState: 'ready', blockers: [] };
    }
    if (prose.length < MIN_NON_IDENTITY_BODY_CHARS) {
      return { configuredState: 'template_unedited', blockers: ['body_below_min_operator_content'] };
    }
    return {
      configuredState: 'edited_incomplete',
      blockers: ['template_marker_present_needs_more_content_or_remove_marker'],
    };
  }

  if (prose.length >= MIN_NON_IDENTITY_BODY_CHARS) {
    return { configuredState: 'ready', blockers: [] };
  }

  return { configuredState: 'edited_incomplete', blockers: ['body_below_min_operator_content'] };
}

export type BuildOrgContextValidationReportInput = {
  orgId: string;
  /** One row per kind; missing kinds should be omitted or included with empty content. */
  filesByKind: Partial<Record<OrgContextFileKind, { content: string }>>;
  annualRevenueUsdSnapshot: number | null;
  now?: Date;
};

export function buildOrgContextValidationReport(input: BuildOrgContextValidationReportInput): OrgContextValidationReport {
  const now = input.now ?? new Date();
  const rows: OrgContextFileReportRow[] = [];
  let grantProfileMissingCodes: string[] = [];

  for (const kind of ORG_CONTEXT_FILE_KINDS) {
    const meta = KIND_META[kind];
    const file = input.filesByKind[kind];
    const content = file?.content ?? '';

    if (!file || !content.trim()) {
      rows.push({
        kind,
        label: meta.label,
        purpose: meta.purpose,
        whatBreaksIfMissing: meta.whatBreaksIfMissing,
        requiredForPilot: meta.requiredForPilot,
        status: meta.requiredForPilot === 'required' ? 'NOT_CONFIGURED' : 'NOT_CONFIGURED',
        configuredState: 'missing_row',
        blockers: ['file_row_missing_or_empty'],
        warnings: [],
      });
      continue;
    }

    if (kind === 'ORG_IDENTITY') {
      const ev = evaluateOrgIdentity(content, input.annualRevenueUsdSnapshot);
      grantProfileMissingCodes = ev.grantMissing;
      const { status } = statusFromConfigured(ev.configuredState, meta.requiredForPilot);
      rows.push({
        kind,
        label: meta.label,
        purpose: meta.purpose,
        whatBreaksIfMissing: meta.whatBreaksIfMissing,
        requiredForPilot: meta.requiredForPilot,
        status: ev.configuredState === 'ready' ? 'READY' : status,
        configuredState: ev.configuredState,
        blockers: ev.blockers,
        warnings: ev.warnings,
      });
      continue;
    }

    const ev = evaluateNonIdentity(kind, content);
    const { status } = statusFromConfigured(ev.configuredState, meta.requiredForPilot);
    rows.push({
      kind,
      label: meta.label,
      purpose: meta.purpose,
      whatBreaksIfMissing: meta.whatBreaksIfMissing,
      requiredForPilot: meta.requiredForPilot,
      status: ev.configuredState === 'ready' ? 'READY' : status,
      configuredState: ev.configuredState,
      blockers: ev.blockers,
      warnings: [],
    });
  }

  const operatorActions: string[] = [];
  const idRow = rows.find(r => r.kind === 'ORG_IDENTITY');
  if (idRow && idRow.configuredState !== 'ready') {
    operatorActions.push(
      'Edit ORG_IDENTITY: set NTEE in **Sector / NTEE**, a state in **State footprint**, and ensure `Organization.annualRevenue` is set for grant matching.',
    );
  }
  if (rows.some(r => r.kind !== 'ORG_IDENTITY' && r.configuredState === 'template_unedited')) {
    operatorActions.push(
      `Replace placeholder content in ORG_SOUL / ORG_AGENTS / ORG_MEMORY / ORG_HEARTBEAT (at least ${MIN_NON_IDENTITY_BODY_CHARS} characters of real prose per file).`,
    );
  }
  if (operatorActions.length === 0) {
    operatorActions.push('Org context files meet minimum pilot checks; keep them updated as the org changes.');
  }

  return {
    orgId: input.orgId,
    asOfIso: now.toISOString(),
    expectedKinds: ORG_CONTEXT_FILE_KINDS,
    rows,
    grantProfileMissingCodes,
    operatorActions,
  };
}

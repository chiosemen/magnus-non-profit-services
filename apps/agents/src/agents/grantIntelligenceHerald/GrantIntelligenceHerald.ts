import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import type { OrgContextFileKind, PrismaClient } from '@magnus/db/types';
import {
  AgentHandoffService,
  OrgIdentityFilesService,
  OrgMemoryService,
  buildOrgContextValidationReport,
  parseOrgIdentityForGrantProfile,
} from '@magnus/org-autonomous-ops-context';
import { createCandidOpportunityFetcher, type GrantMatch, type OpportunityFetcher } from './opportunityClient';
import { runGrantIntelligenceHeraldRules } from './rules';
import { assertInternalSideEffectAllowed } from '../../autonomy/enforcement';
import { assertOperationalMemoryKind } from '../../autonomousOps/operationalMemoryKinds';
import { buildOperationalMemoryEnvelopeV1 } from '../../autonomousOps/operationalMemoryEnvelope';

const HERALD_TO_QUEUE = 'GrantTeam';

export class GrantIntelligenceHerald {
  private readonly sink: AlertSink;
  private readonly fetcher: OpportunityFetcher;
  private readonly handoffSvc: AgentHandoffService;
  private readonly memorySvc: OrgMemoryService;

  constructor(sink: AlertSink, deps?: { opportunityFetcher?: OpportunityFetcher }) {
    this.sink = sink;
    this.fetcher = deps?.opportunityFetcher ?? createCandidOpportunityFetcher();
    const db = prisma as unknown as PrismaClient;
    this.handoffSvc = new AgentHandoffService(db);
    this.memorySvc = new OrgMemoryService(db);
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const orgId = ctx.scope.id;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, ein: true, annualRevenue: true, subscriptionTier: true },
    });
    if (!org) throw new Error('Organization not found');

    const idSvc = new OrgIdentityFilesService(prisma as unknown as PrismaClient);
    const contextFiles = await idSvc.list(org.id, { ensureDefaults: true });
    const orgIdentity = contextFiles.find(f => f.kind === 'ORG_IDENTITY');

    const annualRevenueUsdSnapshot = org.annualRevenue === null ? null : Number(org.annualRevenue);
    const filesByKind = Object.fromEntries(contextFiles.map(f => [f.kind, { content: f.content }])) as Partial<
      Record<OrgContextFileKind, { content: string }>
    >;
    const validation = buildOrgContextValidationReport({
      orgId: org.id,
      filesByKind,
      annualRevenueUsdSnapshot,
    });
    const idRow = validation.rows.find(r => r.kind === 'ORG_IDENTITY');

    const parsed = parseOrgIdentityForGrantProfile({
      orgIdentityMarkdown: orgIdentity?.content ?? '',
      annualRevenueUsdSnapshot,
    });
    const profile = parsed?.profile ?? null;

    if (!profile) {
      const missing = (parsed && parsed.missing.length > 0
        ? parsed.missing
        : orgIdentity
          ? ['grant_profile_incomplete']
          : ['missing_org_identity']) as string[];
      const missingLines =
        missing.length === 0
          ? ['- (unknown)']
          : missing.map(m => {
              if (m === 'missing_org_identity') return '- ORG_IDENTITY file is missing';
              if (m === 'missing_ntee_code') return '- NTEE code missing in **Sector / NTEE** (e.g. `B20`)';
              if (m === 'missing_primary_state') return '- State footprint missing in **State footprint** (e.g. `CA`)';
              if (m === 'missing_annual_budget_usd') return '- Annual revenue snapshot missing (set `Organization.annualRevenue`)';
              if (m === 'grant_profile_incomplete') return '- Grant profile incomplete (NTEE, state, and/or annual revenue)';
              return `- ${m}`;
            });

      const body = [
        'HERALD could not run opportunity matching because required grant profile inputs are missing.',
        '',
        '**Missing inputs detected**:',
        ...missingLines,
        '',
        'Update `ORG_IDENTITY` with the sections above (headers must match), then rerun HERALD.',
        '- Optional: add focus areas as bullet points under **Mission**',
        '',
        `ORG_IDENTITY configured state: ${idRow?.configuredState ?? 'unknown'}`,
        ...(idRow?.configuredState === 'template_unedited'
          ? [
              'Seeded template detected (`magnus:template` in file). Edit the required sections; you may remove that comment when finished.',
            ]
          : []),
        '',
        `ORG_IDENTITY source ref: ${orgIdentity?.id ?? '(none)'}`,
        `ORG_IDENTITY updatedAt: ${orgIdentity?.updatedAt?.toISOString() ?? '(none)'}`,
        '',
        'Internal only. No external scanning or submissions were performed.',
      ].join('\n');

      await this.sink.emit({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        severity: 'LOW',
        type: 'HERALD_MISSING_MATCH_INPUTS',
        title: `HERALD setup needed — grant profile incomplete (${org.name})`,
        body,
        recommendedActions: ['Fill in ORG_IDENTITY sections and rerun HERALD.'],
        dedupeKey: `${ctx.agentName}:${ctx.scope.type}:${org.id}:HERALD_MISSING_MATCH_INPUTS:${ctx.window.end.toISOString()}`,
      });

      return {
        orgId: org.id,
        alertsEmitted: 1,
        skippedRules: ['MISSING_GRANT_PROFILE_INPUTS'],
        orgIdentityUpdatedAt: orgIdentity?.updatedAt?.toISOString() ?? null,
      };
    }

    let matches: GrantMatch[] = [];
    try {
      matches = await this.fetcher({
        nteeCode: profile.nteeCode,
        state: profile.primaryState,
        annualBudget: profile.annualBudgetUsd,
        focusAreas: profile.focusAreas,
        maxResults: 10,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'CANDID_UNAVAILABLE';
      if (code === 'CANDID_UNAVAILABLE' || code === 'CANDID_API_KEY_MISSING') {
        await this.sink.emit({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: org.id,
          severity: 'LOW',
          type: 'HERALD_CANDID_UNAVAILABLE',
          title: `HERALD opportunity source unavailable — ${org.name}`,
          body: [
            'HERALD could not fetch grant opportunities from the external source.',
            '',
            `Reason: ${code}`,
            '',
            'In production, HERALD fails closed and will not fabricate seed opportunities.',
            'Verify CANDID_API_KEY and network access, then rerun HERALD.',
          ].join('\n'),
          recommendedActions: ['Set CANDID_API_KEY and rerun HERALD.'],
          dedupeKey: `${ctx.agentName}:${ctx.scope.type}:${org.id}:HERALD_CANDID_UNAVAILABLE:${ctx.window.end.toISOString()}`,
        });
        return {
          orgId: org.id,
          alertsEmitted: 1,
          skippedRules: ['CANDID_UNAVAILABLE'],
          orgIdentityUpdatedAt: orgIdentity?.updatedAt?.toISOString() ?? null,
        };
      }
      throw err;
    }

    const result = runGrantIntelligenceHeraldRules({
      ctx,
      org: { id: org.id, name: org.name, ein: org.ein },
      matches,
      orgIdentityFileId: orgIdentity?.id ?? null,
    });

    for (const alert of result.alerts) {
      await this.sink.emit(alert);
    }

    const selectedForLoi = matches
      .filter(m => result.loiPrepOpportunityIds.includes(m.opportunity.id))
      .slice(0, 5);

    const createdHandoffIds: string[] = [];
    for (const m of selectedForLoi) {
      const input = buildLoiPrepHandoff({
        org: { id: org.id, name: org.name, ein: org.ein },
        match: m,
        orgIdentityFileId: orgIdentity?.id ?? null,
        orgGrantProfile: {
          nteeCode: profile.nteeCode,
          primaryState: profile.primaryState,
          annualBudgetUsd: profile.annualBudgetUsd,
        },
      });
      assertInternalSideEffectAllowed({ autonomyTier: ctx.autonomyTier, requiresHumanReview: ctx.requiresHumanReview, effect: 'handoff' });
      const h = await this.handoffSvc.create(org.id, input);
      createdHandoffIds.push(h.id);
    }

    assertInternalSideEffectAllowed({ autonomyTier: ctx.autonomyTier, requiresHumanReview: ctx.requiresHumanReview, effect: 'memory' });
    assertOperationalMemoryKind('GrantIntelligenceHerald', 'herald_grant_readiness_update');
    await this.memorySvc.appendOperational(org.id, {
      agentName: ctx.agentName,
      kind: 'herald_grant_readiness_update',
      payload: buildOperationalMemoryEnvelopeV1({
        asOf: ctx.window.end,
        summary: `Grant match scan ran; matches=${matches.length}; LOI_prep_selected=${selectedForLoi.length}.`,
        data: {
          matchesFound: matches.length,
          matchesHighUrgency: matches.filter(m => m.urgency === 'high').length,
          selectedForLoiPrep: selectedForLoi.map(m => ({ opportunityId: m.opportunity.id, funderName: m.opportunity.funderName })),
          orgGrantProfile: {
            nteeCode: profile.nteeCode,
            primaryState: profile.primaryState,
            annualBudgetUsd: profile.annualBudgetUsd,
            focusAreas: profile.focusAreas,
          },
        },
      }),
      sourceRefs: [
        { type: 'org_context', kind: 'ORG_IDENTITY', id: orgIdentity?.id ?? null },
        { type: 'candid_scan', ntee: profile.nteeCode, state: profile.primaryState },
      ],
      confidence: 0.8,
    });

    return {
      orgId: org.id,
      alertsEmitted: result.alerts.length,
      skippedRules: result.skippedRules,
      ...result.metrics,
      matchesFound: matches.length,
      handoffsCreated: createdHandoffIds.length,
      handoffIds: createdHandoffIds,
      orgIdentityUpdatedAt: orgIdentity?.updatedAt?.toISOString() ?? null,
      sourceRefs: {
        orgId: org.id,
        orgIdentityFileId: orgIdentity?.id ?? null,
        matchOpportunityIds: matches.map(m => m.opportunity.id),
      },
    };
  }
}

function buildLoiPrepHandoff(params: {
  org: { id: string; name: string; ein: string };
  match: GrantMatch;
  orgIdentityFileId: string | null;
  orgGrantProfile: { nteeCode: string; primaryState: string; annualBudgetUsd: number };
}) {
  const opp = params.match.opportunity;
  const nteeListed = opp.eligibleNTEECodes?.includes(params.orgGrantProfile.nteeCode);
  const stateListed = opp.eligibleStates?.includes(params.orgGrantProfile.primaryState);
  const eligibilityLines = [
    `Eligibility (from opportunity listing):`,
    `- NTEE ${params.orgGrantProfile.nteeCode}: ${nteeListed ? 'listed' : 'not_listed_or_unknown'}`,
    `- State ${params.orgGrantProfile.primaryState}: ${stateListed ? 'listed' : 'not_listed_or_unknown'}`,
  ];
  const body = [
    `HERALD identified a matching opportunity that requires an LOI.`,
    '',
    `Organization: ${params.org.name} (EIN ${params.org.ein})`,
    `Funder: ${opp.funderName}`,
    `Program: ${opp.programName}`,
    `Opportunity ID: ${opp.id}`,
    `Application URL: ${opp.applicationUrl ?? '(not provided)'}`,
    `Application deadline: ${opp.applicationDeadline ?? '(unknown)'}`,
    `Rolling deadline: ${opp.isRollingDeadline ? 'yes' : 'no_or_unknown'}`,
    `LOI required: ${opp.requiresLetterOfInquiry ? 'yes' : 'no'}`,
    `Accepts unsolicited: ${opp.acceptsUnsolicited ? 'yes' : 'no_or_unknown'}`,
    '',
    `Match score: ${params.match.matchScore}`,
    `Match reasons: ${params.match.matchReasons.join('; ')}`,
    params.match.missingCriteria.length > 0 ? `Missing criteria: ${params.match.missingCriteria.join('; ')}` : `Missing criteria: (none flagged by rules)`,
    '',
    ...eligibilityLines,
    '',
    'Operator checklist (internal):',
    '- Open the application URL and confirm: eligibility, deadlines, LOI format/limits, required attachments, and submission rules.',
    '- Capture key requirements into an internal draft doc and assign an internal owner.',
    '- Draft LOI only after confirming eligibility and requirements (no automated submission).',
    '',
    '---',
    'Boundaries:',
    '- Internal draft prep only. Do NOT submit externally from this handoff.',
    '- Do NOT contact the funder automatically.',
    '- Verify eligibility and requirements on the funder website before drafting.',
  ].join('\n');

  const sourceEvidence = [
    params.orgIdentityFileId ? [{ type: 'org_context', kind: 'ORG_IDENTITY', id: params.orgIdentityFileId }] : [],
    [{ type: 'candid_opportunity', opportunityId: opp.id }],
    [{ type: 'application_url', url: opp.applicationUrl ?? null }],
  ].flat();

  return {
    fromAgentName: 'GrantIntelligenceHerald',
    toAgentName: HERALD_TO_QUEUE,
    title: `HERALD LOI prep: ${opp.funderName} — ${opp.programName}`,
    body,
    urgency: params.match.urgency === 'high' ? 'high' : 'normal',
    requiresHumanReview: true,
    sourceEvidence,
  };
}


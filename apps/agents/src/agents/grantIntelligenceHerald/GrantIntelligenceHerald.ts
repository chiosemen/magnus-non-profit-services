import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import type { PrismaClient } from '@magnus/db/types';
import { AgentHandoffService, OrgMemoryService } from '@magnus/org-autonomous-ops-context';
import { createCandidOpportunityFetcher, type GrantMatch, type OpportunityFetcher } from './opportunityClient';
import { parseOrgIdentityForGrantProfile } from './parseOrgIdentity';
import { runGrantIntelligenceHeraldRules } from './rules';

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

    const orgIdentity = await prisma.orgContextFile.findUnique({
      where: { orgId_kind: { orgId: org.id, kind: 'ORG_IDENTITY' } },
      select: { id: true, content: true, updatedAt: true },
    });

    const annualRevenueUsdSnapshot = org.annualRevenue === null ? null : Number(org.annualRevenue);
    const parsed = orgIdentity
      ? parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: orgIdentity.content, annualRevenueUsdSnapshot })
      : null;

    if (!parsed) {
      const body = [
        'HERALD could not run opportunity matching because required grant profile inputs are missing.',
        '',
        'Update `ORG_IDENTITY` with:',
        '- NTEE code in **Sector / NTEE** (e.g. `B20`)',
        '- At least one two-letter state code in **State footprint** (e.g. `CA`)',
        '- Annual revenue/budget snapshot (Organization.annualRevenue) must be set',
        '- Optional: add focus areas as bullet points under **Mission**',
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

    const matches = await this.fetcher({
      nteeCode: parsed.nteeCode,
      state: parsed.primaryState,
      annualBudget: parsed.annualBudgetUsd,
      focusAreas: parsed.focusAreas,
      maxResults: 10,
    });

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
      });
      const h = await this.handoffSvc.create(org.id, input);
      createdHandoffIds.push(h.id);
    }

    await this.memorySvc.appendOperational(org.id, {
      agentName: ctx.agentName,
      kind: 'herald_grant_readiness_update',
      payload: {
        matchesFound: matches.length,
        matchesHighUrgency: matches.filter(m => m.urgency === 'high').length,
        selectedForLoiPrep: selectedForLoi.map(m => ({ opportunityId: m.opportunity.id, funderName: m.opportunity.funderName })),
        orgGrantProfile: {
          nteeCode: parsed.nteeCode,
          primaryState: parsed.primaryState,
          annualBudgetUsd: parsed.annualBudgetUsd,
          focusAreas: parsed.focusAreas,
        },
      },
      sourceRefs: [
        { type: 'org_context', kind: 'ORG_IDENTITY', id: orgIdentity?.id ?? null },
        { type: 'candid_scan', ntee: parsed.nteeCode, state: parsed.primaryState },
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

function buildLoiPrepHandoff(params: { org: { id: string; name: string; ein: string }; match: GrantMatch }) {
  const opp = params.match.opportunity;
  const body = [
    `HERALD identified a matching opportunity that requires an LOI.`,
    '',
    `Organization: ${params.org.name} (EIN ${params.org.ein})`,
    `Funder: ${opp.funderName}`,
    `Program: ${opp.programName}`,
    `Opportunity ID: ${opp.id}`,
    `Application URL: ${opp.applicationUrl ?? '(not provided)'}`,
    `Deadline: ${opp.applicationDeadline ?? '(unknown)'}`,
    '',
    `Match score: ${params.match.matchScore}`,
    `Match reasons: ${params.match.matchReasons.join('; ')}`,
    '',
    '---',
    'Boundaries:',
    '- Internal draft prep only. Do NOT submit externally from this handoff.',
    '- Do NOT contact the funder automatically.',
    '- Verify eligibility and requirements on the funder website before drafting.',
  ].join('\n');

  return {
    fromAgentName: 'GrantIntelligenceHerald',
    toAgentName: HERALD_TO_QUEUE,
    title: `HERALD LOI prep: ${opp.funderName} — ${opp.programName}`,
    body,
    urgency: params.match.urgency === 'high' ? 'high' : 'normal',
    requiresHumanReview: true,
    sourceEvidence: [
      { type: 'candid_opportunity', opportunityId: opp.id },
      { type: 'application_url', url: opp.applicationUrl ?? null },
    ],
  };
}


import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';
import type { GrantMatch } from './opportunityClient';
import { buildHeraldReviewPacket, formatHeraldReviewPacketMarkdown } from './heraldPacket';

export type HeraldInputs = {
  ctx: AgentRunContext;
  org: { id: string; name: string; ein: string };
  matches: GrantMatch[];
  orgIdentityFileId: string | null;
};

export type HeraldRuleResult = {
  alerts: AlertEvent[];
  skippedRules: string[];
  metrics: Record<string, unknown>;
  packetMarkdown: string;
  loiPrepOpportunityIds: string[];
};

export function heraldDedupeKey(params: {
  agentName: string;
  scopeType: string;
  scopeId: string;
  alertType: string;
  windowEnd: Date;
}): string {
  return `${params.agentName}:${params.scopeType}:${params.scopeId}:${params.alertType}:${params.windowEnd.toISOString()}`;
}

function shouldTriggerLoiPrep(m: GrantMatch): boolean {
  // Conservative trigger: LOI required + decent match score.
  if (!m.opportunity.requiresLetterOfInquiry) return false;
  if (m.matchScore < 60) return false;
  // Allow unknown urgency (rolling deadlines) but prefer known; still OK to prep.
  return true;
}

export function runGrantIntelligenceHeraldRules(inputs: HeraldInputs): HeraldRuleResult {
  const { ctx, org } = inputs;
  const alerts: AlertEvent[] = [];
  const skippedRules: string[] = [];

  const packet = buildHeraldReviewPacket({
    org,
    window: ctx.window,
    matches: inputs.matches,
    orgIdentityFileId: inputs.orgIdentityFileId,
  });
  const packetMarkdown = formatHeraldReviewPacketMarkdown(packet);

  const loiPrep = inputs.matches.filter(shouldTriggerLoiPrep).slice(0, 5);

  alerts.push({
    agentName: ctx.agentName,
    scopeType: ctx.scope.type,
    scopeId: org.id,
    severity: loiPrep.length > 0 ? 'MED' : inputs.matches.length > 0 ? 'LOW' : 'LOW',
    type: 'HERALD_GRANT_OPPORTUNITY_REVIEW_PACKET',
    title: `HERALD — Grant opportunity review (internal) — ${org.name}`,
    body: packetMarkdown,
    recommendedActions: [
      'Review the source index and verify deadlines/eligibility on funder sites.',
      'If pursuing, assign an internal owner and begin LOI/proposal drafting (no submission automation).',
    ],
    dedupeKey: heraldDedupeKey({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: org.id,
      alertType: 'HERALD_GRANT_OPPORTUNITY_REVIEW_PACKET',
      windowEnd: ctx.window.end,
    }),
  });

  return {
    alerts,
    skippedRules,
    packetMarkdown,
    loiPrepOpportunityIds: loiPrep.map(x => x.opportunity.id),
    metrics: {
      matchesConsidered: inputs.matches.length,
      loiPrepCount: loiPrep.length,
      sourceRefCount: packet.sourceIndex.length,
    },
  };
}


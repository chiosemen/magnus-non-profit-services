/**
 * Client/operator read model for launch agents: capabilities, subscription gates, enforcement truth.
 * Subscription gates must stay aligned with `packages/subscription/src/autonomousOpsPolicy.ts`.
 */

import type { SubscriptionStatus, SubscriptionTier } from '@magnus/db/types';
import { subscriptionAllowsScheduledAgent } from '@magnus/subscription';
import type { ScheduledAgentName } from '@magnus/subscription';

export type LaunchAgentPilotPositioning = 'hq_launch_agent' | 'internal_worker_scoped';

export type LaunchAgentPolicyRow = {
  personaLabel: string;
  agentName: ScheduledAgentName;
  pilotPositioning: LaunchAgentPilotPositioning;
  /** Plain-language subscription gate; derived from `subscriptionAllowsScheduledAgent`. */
  subscriptionEligibilitySummary: string;
  whatItDoes: string;
  /** Where `requiresHumanReview` or Tier B semantics apply in real persisted artifacts. */
  humanReviewSemantics: string;
  /** What agents actually enforce today (process / DB effects). */
  currentlyEnforcedInCode: string[];
  /** External-class actions agents do not perform autonomously today. */
  blockedAutonomousExternal: string[];
};

const ACTIVE: SubscriptionStatus = 'ACTIVE';

function eligibilitySummary(agentName: ScheduledAgentName): string {
  const tiers: SubscriptionTier[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];
  const allowed = tiers.filter(t => subscriptionAllowsScheduledAgent({ tier: t, status: ACTIVE, agentName }));
  if (allowed.length === 0) return 'No scheduled runs: STARTER tier, or subscription not ACTIVE.';
  if (allowed.includes('GROWTH') && allowed.includes('ENTERPRISE') && !allowed.includes('STARTER')) {
    return 'GROWTH or ENTERPRISE when subscription is ACTIVE (agents service must be enabled separately).';
  }
  if (allowed.length === 1 && allowed[0] === 'ENTERPRISE') {
    return 'ENTERPRISE only when subscription is ACTIVE (agents service must be enabled separately).';
  }
  return `${allowed.join(', ')} when ACTIVE — confirm in autonomousOpsPolicy.ts`;
}

const ROWS: LaunchAgentPolicyRow[] = [
  {
    personaLabel: 'STEWARD',
    agentName: 'ComplianceWatchdog',
    pilotPositioning: 'hq_launch_agent',
    subscriptionEligibilitySummary: eligibilitySummary('ComplianceWatchdog'),
    whatItDoes:
      'Scheduled compliance scan; emits internal alerts and may persist operational memory. May create staff-facing handoffs for HIGH stewardship routing (internal draft context only).',
    humanReviewSemantics:
      'Some steward handoffs are created with `requiresHumanReview: true` so staff triage before downstream work. Tier B org cap still requires `requiresHumanReview` for gated internal effects (`assertInternalSideEffectAllowed` on handoff/memory).',
    currentlyEnforcedInCode: [
      'Autonomy tier + review flag checked before persisting selected handoffs and memory (`apps/agents` enforcement).',
      'Alerts and runs stored in Postgres; no autonomous email or filing.',
    ],
    blockedAutonomousExternal: [
      'No autonomous outbound email, government filing, grant submission, or money movement.',
    ],
  },
  {
    personaLabel: 'ORACLE',
    agentName: 'BoardIntelligenceOracle',
    pilotPositioning: 'hq_launch_agent',
    subscriptionEligibilitySummary: eligibilitySummary('BoardIntelligenceOracle'),
    whatItDoes:
      'Board/executive prep: internal digests and packets sourced from org data (compliance, grants, alerts). Persists internal alerts and operational memory as implemented.',
    humanReviewSemantics:
      'Standard internal persist paths use Tier A unless org is capped at Tier B/C; handoff/memory effects honor `requiresHumanReview` when Tier B requires it.',
    currentlyEnforcedInCode: [
      'Same internal effect checks as other agents for handoff/memory side effects when used.',
      'No autonomous distribution to directors’ inboxes as an external send.',
    ],
    blockedAutonomousExternal: ['No autonomous external send or official board portal submit.'],
  },
  {
    personaLabel: 'SENTINEL',
    agentName: 'FinancialSentinel',
    pilotPositioning: 'hq_launch_agent',
    subscriptionEligibilitySummary: eligibilitySummary('FinancialSentinel'),
    whatItDoes:
      'Financial watch: reads Plaid-oriented signals when configured; emits internal alerts (e.g. runway, pace). Does not move money or mutate external bank records.',
    humanReviewSemantics:
      'Alerts are internal signals; resolving or acting on them is a human/ops workflow outside autonomous agents.',
    currentlyEnforcedInCode: [
      'Fail-closed Plaid client when misconfigured (`CASH_RUNWAY_UNAVAILABLE` style outcomes).',
      'Internal alert persistence only.',
    ],
    blockedAutonomousExternal: [
      'No autonomous wire transfers, card charges, or authoritative ledger write-back to financial institutions.',
    ],
  },
  {
    personaLabel: 'HERALD (lifecycle)',
    agentName: 'GrantLifecycleManager',
    pilotPositioning: 'hq_launch_agent',
    subscriptionEligibilitySummary: eligibilitySummary('GrantLifecycleManager'),
    whatItDoes: 'Grant lifecycle monitoring and internal alerts; no autonomous grant submission.',
    humanReviewSemantics: 'Handoff/memory paths follow the same Tier A/B enforcement as other agents when those effects occur.',
    currentlyEnforcedInCode: ['Internal alerts and runs; subscription-gated to ENTERPRISE.'],
    blockedAutonomousExternal: ['No autonomous submission to funders or portals.'],
  },
  {
    personaLabel: 'HERALD (intelligence)',
    agentName: 'GrantIntelligenceHerald',
    pilotPositioning: 'hq_launch_agent',
    subscriptionEligibilitySummary: eligibilitySummary('GrantIntelligenceHerald'),
    whatItDoes:
      'Bounded opportunity review (e.g. Candid) and internal prep packets/alerts; may set `requiresHumanReview` on handoffs when funneling LOI-style work to staff.',
    humanReviewSemantics:
      'HERALD-created handoffs may explicitly require human review before staff treat them as approved next steps.',
    currentlyEnforcedInCode: [
      'Internal effect enforcement on handoff/memory when emitted.',
      'Unavailable external API paths fail closed with internal alerts (no silent success).',
    ],
    blockedAutonomousExternal: ['No autonomous LOI/grant submission to external systems.'],
  },
  {
    personaLabel: 'Worker optimizer (non-HQ persona)',
    agentName: 'WorkerIncomeOptimizer',
    pilotPositioning: 'internal_worker_scoped',
    subscriptionEligibilitySummary: eligibilitySummary('WorkerIncomeOptimizer'),
    whatItDoes:
      'Worker-scoped scheduled agent; not part of the nonprofit “headquarters” pilot persona set in v1 positioning. Internal alerts for eligible worker scopes.',
    humanReviewSemantics: 'Same autonomy tier machinery when internal side effects apply.',
    currentlyEnforcedInCode: ['ENTERPRISE + ACTIVE; worker scope only in scheduler.'],
    blockedAutonomousExternal: ['No autonomous payroll or tax filing actions.'],
  },
];

export function getLaunchAgentPolicyRows(): readonly LaunchAgentPolicyRow[] {
  return ROWS;
}

export type AutonomyPolicySurface = {
  /** What the runtime does today (agents + org-dashboard-api), not the aspirational matrix alone. */
  currentEnforcementSummary: string[];
  /** Documented target: connector × action class — not yet enforced per action on every path. */
  targetPolicyPointer: string;
  externalNeverAutonomous: string[];
  pilotOnlyProductSurfaces: string[];
};

export function buildAutonomyPolicySurface(): AutonomyPolicySurface {
  return {
    currentEnforcementSummary: [
      'Org `maxAutonomyTier` and `agentBoundaryOverrides` are stored in `OrgAutonomousOpsSettings` (read below when configured). Writes today use `org-dashboard-api` JWT `PUT /api/org/autonomous-ops/settings` — this web app is read-only for settings.',
      'Agents stamp `AutonomyTier` + `requiresHumanReview` from boundary mode and org cap (`apps/agents/src/scheduler/scheduler.ts`).',
      '`assertInternalSideEffectAllowed` gates only handoff and memory persistence — not every tool or connector action (`apps/agents/src/autonomy/enforcement.ts`).',
      'Subscription tier + ACTIVE status gate which agents may run (`subscriptionAllowsScheduledAgent`).',
    ],
    targetPolicyPointer:
      'Target connector × action-class bands: `packages/org-autonomous-ops-context/src/accordActionMatrix.ts` and `docs/product/MAGNUS_ACCORD_ACTION_MATRIX.md` (not fully wired into every agent call).',
    externalNeverAutonomous: [
      'Autonomous agents do not send email/Slack/SMS, file government forms, submit grants, or move money.',
      '`external_send`, `external_submit`, and `irreversible_action` are NEVER autonomous per the action matrix.',
    ],
    pilotOnlyProductSurfaces: [
      'Connectors page: MCP Connector, Grant Generator, Worker Financial Layer are PILOT_ONLY until DB-backed product state exists.',
      'Several Executive “next step” links may be placeholders (`UNIMPLEMENTED_IN_REPO` in payloads).',
    ],
  };
}

import type { ClaudeStatus, PrismaClient, SubscriptionStatus, SubscriptionTier } from '@magnus/db/types';
import { subscriptionAllowsScheduledAgent } from '@magnus/subscription';
import { buildActiveObligations } from './activeObligations';
import { ORG_CONTEXT_FILE_KINDS } from './kinds';
import { DEFAULT_MEMORY_SUFFICIENCY_THRESHOLDS, evaluateMemorySufficiency } from './memorySufficiency';
import { loadMemorySufficiencyStatsForOrg } from './memorySufficiencyStats';

/** Truthful readiness — never implies READY without evidence. */
export type ReadinessCategory = 'NOT_CONFIGURED' | 'PARTIAL' | 'READY';

export type PilotReadinessDimension = {
  id: string;
  label: string;
  status: ReadinessCategory;
  blockers: string[];
  notes: string[];
};

export type PilotReadinessOverall = {
  summary: ReadinessCategory;
  /** True when no critical dimension is NOT_CONFIGURED (pilot can proceed with gaps). */
  pilotCandidate: boolean;
  blockers: string[];
};

export type PilotReadinessSnapshot = {
  orgId: string;
  asOfIso: string;
  org: {
    subscriptionTier: SubscriptionTier;
    subscriptionStatus: SubscriptionStatus;
    claudeStatus: ClaudeStatus;
  };
  dimensions: PilotReadinessDimension[];
  overall: PilotReadinessOverall;
  memoryEvaluation: ReturnType<typeof evaluateMemorySufficiency>;
};

const MIN_CONTEXT_CHARS = 24;

const CRITICAL_DIMENSION_IDS = new Set([
  'org_exists',
  'subscription_active',
  'org_identity_context',
  'autonomous_ops',
  'claude_connector',
]);

function worst(a: ReadinessCategory, b: ReadinessCategory): ReadinessCategory {
  const order: Record<ReadinessCategory, number> = { NOT_CONFIGURED: 0, PARTIAL: 1, READY: 2 };
  return order[a] < order[b] ? a : b;
}

export function rollUpPilotReadiness(dimensions: PilotReadinessDimension[]): PilotReadinessOverall {
  let summary: ReadinessCategory = 'READY';
  const blockers: string[] = [];
  for (const d of dimensions) {
    summary = worst(summary, d.status);
    for (const b of d.blockers) {
      blockers.push(`${d.id}:${b}`);
    }
  }
  const pilotCandidate = !dimensions.some(
    d => CRITICAL_DIMENSION_IDS.has(d.id) && d.status === 'NOT_CONFIGURED',
  );
  return { summary, pilotCandidate, blockers };
}

function hasAllowedLaunchAgent(params: {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  enabledAgents: string[];
}): boolean {
  if (params.status !== 'ACTIVE') return false;
  for (const agentName of params.enabledAgents) {
    if (
      subscriptionAllowsScheduledAgent({
        tier: params.tier,
        status: 'ACTIVE',
        agentName,
      })
    ) {
      return true;
    }
  }
  return false;
}

export type BuildPilotReadinessInput = {
  db: PrismaClient;
  orgId: string;
  now?: Date;
};

export async function buildPilotReadiness(params: BuildPilotReadinessInput): Promise<PilotReadinessSnapshot> {
  const now = params.now ?? new Date();
  const asOfIso = now.toISOString();

  const org = await params.db.organization.findUnique({
    where: { id: params.orgId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
      claudeStatus: true,
      stripeAccountId: true,
    },
  });

  if (!org) {
    const emptyStats = await loadMemorySufficiencyStatsForOrg(params.db, params.orgId);
    const dimensions: PilotReadinessDimension[] = [
      {
        id: 'org_exists',
        label: 'Organization record',
        status: 'NOT_CONFIGURED',
        blockers: ['organization_not_found'],
        notes: [],
      },
    ];
    return {
      orgId: params.orgId,
      asOfIso,
      org: {
        subscriptionTier: 'STARTER',
        subscriptionStatus: 'CANCELED',
        claudeStatus: 'NOT_ENABLED',
      },
      dimensions,
      overall: rollUpPilotReadiness(dimensions),
      memoryEvaluation: evaluateMemorySufficiency({
        stats: emptyStats,
        thresholds: DEFAULT_MEMORY_SUFFICIENCY_THRESHOLDS,
      }),
    };
  }

  const [
    settingsRow,
    contextFiles,
    memoryStats,
    donorAgg,
    volunteerAgg,
    obligations,
  ] = await Promise.all([
    params.db.orgAutonomousOpsSettings.findUnique({
      where: { orgId: params.orgId },
      select: { enabledAgents: true },
    }),
    params.db.orgContextFile.findMany({
      where: { orgId: params.orgId },
      select: { kind: true, content: true },
    }),
    loadMemorySufficiencyStatsForOrg(params.db, params.orgId),
    params.db.donorEvent.aggregate({
      where: { orgId: params.orgId },
      _count: { _all: true },
    }),
    params.db.volunteerEvent.aggregate({
      where: { orgId: params.orgId },
      _count: { _all: true },
    }),
    buildActiveObligations({ db: params.db, orgId: params.orgId, take: 50, now }),
  ]);

  const enabledAgents = Array.isArray(settingsRow?.enabledAgents)
    ? (settingsRow!.enabledAgents as string[]).filter(x => typeof x === 'string')
    : [];

  const byKind = new Map(contextFiles.map(f => [f.kind, String(f.content ?? '').trim()]));

  const missingKinds: string[] = [];
  const shortKinds: string[] = [];
  for (const kind of ORG_CONTEXT_FILE_KINDS) {
    const text = byKind.get(kind) ?? '';
    if (!text) missingKinds.push(kind);
    else if (text.length < MIN_CONTEXT_CHARS) shortKinds.push(kind);
  }

  let identityStatus: ReadinessCategory;
  if (missingKinds.length === ORG_CONTEXT_FILE_KINDS.length) identityStatus = 'NOT_CONFIGURED';
  else if (missingKinds.length > 0 || shortKinds.length > 0) identityStatus = 'PARTIAL';
  else identityStatus = 'READY';

  const identityBlockers: string[] = [];
  if (missingKinds.length) identityBlockers.push(`missing_context_kinds:${missingKinds.join(',')}`);
  if (shortKinds.length) identityBlockers.push(`context_too_short:${shortKinds.join(',')}`);

  const subscriptionActive = org.subscriptionStatus === 'ACTIVE';

  let autonomousStatus: ReadinessCategory;
  const autonomousNotes: string[] = [];
  if (!settingsRow) {
    autonomousStatus = 'NOT_CONFIGURED';
  } else if (enabledAgents.length === 0) {
    autonomousStatus = 'PARTIAL';
    autonomousNotes.push('no_launch_agents_enabled');
  } else if (!hasAllowedLaunchAgent({ tier: org.subscriptionTier, status: org.subscriptionStatus, enabledAgents })) {
    autonomousStatus = 'PARTIAL';
    autonomousNotes.push('no_subscription_eligible_enabled_agents');
  } else {
    autonomousStatus = 'READY';
  }

  const autonomousBlockers: string[] = [];
  if (!settingsRow) autonomousBlockers.push('autonomous_ops_settings_row_missing');
  if (settingsRow && enabledAgents.length === 0) autonomousBlockers.push('enabled_agents_empty');

  let claudeStatus: ReadinessCategory;
  const claudeNotes: string[] = [];
  switch (org.claudeStatus) {
    case 'ACTIVE':
      claudeStatus = 'READY';
      break;
    case 'CONFIGURING':
      claudeStatus = 'PARTIAL';
      claudeNotes.push('claude_partner_still_configuring');
      break;
    case 'SUSPENDED':
      claudeStatus = 'PARTIAL';
      claudeNotes.push('claude_partner_suspended');
      break;
    case 'NOT_ENABLED':
    default:
      claudeStatus = 'NOT_CONFIGURED';
      claudeNotes.push('claude_partner_not_enabled');
  }

  let subscriptionDim: PilotReadinessDimension;
  if (!subscriptionActive) {
    subscriptionDim = {
      id: 'subscription_active',
      label: 'Subscription (Accord pilot)',
      status: 'NOT_CONFIGURED',
      blockers: [`subscription_status_${org.subscriptionStatus}`],
      notes: ['Executive and scheduled agents require an ACTIVE subscription in this read model.'],
    };
  } else {
    subscriptionDim = {
      id: 'subscription_active',
      label: 'Subscription (Accord pilot)',
      status: 'READY',
      blockers: [],
      notes: [],
    };
  }

  let executiveStatus: ReadinessCategory;
  const execBlockers: string[] = [];
  if (!subscriptionActive) {
    executiveStatus = 'NOT_CONFIGURED';
    execBlockers.push('subscription_not_active');
  } else if (!byKind.get('ORG_IDENTITY') || (byKind.get('ORG_IDENTITY') ?? '').length < MIN_CONTEXT_CHARS) {
    executiveStatus = 'PARTIAL';
    execBlockers.push('org_identity_required_for_executive_surface');
  } else {
    executiveStatus = 'READY';
  }

  const obligationsStatus: ReadinessCategory = obligations.length > 0 ? 'READY' : 'PARTIAL';
  const obligationNotes =
    obligations.length === 0
      ? ['active_obligation_snapshot_empty']
      : [`active_obligations_count:${obligations.length}`];

  const donorCount = donorAgg._count?._all ?? 0;
  const volunteerCount = volunteerAgg._count?._all ?? 0;
  const stripeConnected = Boolean(org.stripeAccountId);

  let ledgerStatus: ReadinessCategory;
  const ledgerNotes: string[] = [];
  if (donorCount > 0 || volunteerCount > 0 || stripeConnected) {
    ledgerStatus = 'READY';
    ledgerNotes.push(
      `donor_rows:${donorCount},volunteer_rows:${volunteerCount},stripe:${stripeConnected ? 'yes' : 'no'}`,
    );
  } else {
    ledgerStatus = 'PARTIAL';
    ledgerNotes.push('no_donor_or_volunteer_rows_and_no_stripe_account');
  }

  const memoryEvaluation = evaluateMemorySufficiency({
    stats: memoryStats,
    thresholds: DEFAULT_MEMORY_SUFFICIENCY_THRESHOLDS,
  });

  let memoryStatus: ReadinessCategory;
  if (memoryStats.operational.totalEntries === 0) {
    memoryStatus = 'NOT_CONFIGURED';
  } else if (memoryEvaluation.readiness === 'GO') {
    memoryStatus = 'READY';
  } else {
    memoryStatus = 'PARTIAL';
  }

  const memoryBlockers =
    memoryEvaluation.readiness === 'NO_GO' ? memoryEvaluation.reasons.map(r => `memory:${r}`) : [];

  const dimensions: PilotReadinessDimension[] = [
    subscriptionDim,
    {
      id: 'org_identity_context',
      label: 'Org identity context (5 canonical files)',
      status: identityStatus,
      blockers: identityBlockers,
      notes: [
        `expected_kinds:${ORG_CONTEXT_FILE_KINDS.join(',')}`,
        `min_chars_per_file:${MIN_CONTEXT_CHARS}`,
      ],
    },
    {
      id: 'autonomous_ops',
      label: 'Autonomous Ops settings & launch agents',
      status: autonomousStatus,
      blockers: autonomousBlockers,
      notes: autonomousNotes,
    },
    {
      id: 'claude_connector',
      label: 'Claude Partner connector',
      status: claudeStatus,
      blockers: claudeStatus === 'NOT_CONFIGURED' ? ['claude_not_enabled'] : [],
      notes: claudeNotes,
    },
    {
      id: 'executive_surface',
      label: 'Executive board surface',
      status: executiveStatus,
      blockers: execBlockers,
      notes: ['Requires ACTIVE subscription and ORG_IDENTITY context for pilot-grade usability.'],
    },
    {
      id: 'obligations_snapshot',
      label: 'Active obligations snapshot',
      status: obligationsStatus,
      blockers: obligations.length === 0 ? ['no_rows_in_obligation_snapshot'] : [],
      notes: obligationNotes,
    },
    {
      id: 'donor_volunteer_ledgers',
      label: 'Donor & volunteer ledgers (pilot scope)',
      status: ledgerStatus,
      blockers: ledgerStatus === 'PARTIAL' ? ['no_ledger_signal_yet'] : [],
      notes: ledgerNotes,
    },
    {
      id: 'memory_reflection',
      label: 'Operational memory (reflection readiness)',
      status: memoryStatus,
      blockers: memoryBlockers,
      notes: [
        memoryEvaluation.readiness === 'GO'
          ? 'memory_thresholds_met'
          : `memory_readiness_${memoryEvaluation.readiness}`,
      ],
    },
  ];

  return {
    orgId: params.orgId,
    asOfIso,
    org: {
      subscriptionTier: org.subscriptionTier,
      subscriptionStatus: org.subscriptionStatus,
      claudeStatus: org.claudeStatus,
    },
    dimensions,
    overall: rollUpPilotReadiness(dimensions),
    memoryEvaluation,
  };
}

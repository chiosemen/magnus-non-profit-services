import type { PrismaClient } from '@magnus/db/types';
import { buildExecutiveBoard } from './executiveBoard';
import { buildOperationsLog } from './operationsLog';
import {
  buildPilotReadiness,
  rollUpPilotReadiness,
  type PilotReadinessDimension,
  type PilotReadinessSnapshot,
} from './pilotReadiness';

/** Three-way launch gate — never implies READY without evidence. */
export type LaunchReadinessStatus = 'READY' | 'READY_WITH_CAVEATS' | 'NOT_READY';

const LAUNCH_GRADE_EXCLUDE_IDS = new Set<string>(['obligations_snapshot', 'memory_reflection']);

const CRITICAL_WITHOUT_CLAUDE = new Set([
  'org_exists',
  'subscription_active',
  'org_identity_context',
  'autonomous_ops',
]);

function launchGradeSummary(dimensions: PilotReadinessDimension[]) {
  const filtered = dimensions.filter(d => !LAUNCH_GRADE_EXCLUDE_IDS.has(d.id));
  return rollUpPilotReadiness(filtered);
}

function launchPilotCandidate(
  dimensions: PilotReadinessDimension[],
  treatClaudeAsOptional: boolean,
): boolean {
  if (treatClaudeAsOptional) {
    return !dimensions.some(d => CRITICAL_WITHOUT_CLAUDE.has(d.id) && d.status === 'NOT_CONFIGURED');
  }
  return !dimensions.some(
    d =>
      [
        'org_exists',
        'subscription_active',
        'org_identity_context',
        'autonomous_ops',
        'claude_connector',
      ].includes(d.id) && d.status === 'NOT_CONFIGURED',
  );
}

export type BuildLaunchReadinessInput = {
  db: PrismaClient;
  orgId: string;
  now?: Date;
  /**
   * When true, donor/volunteer ledger must be READY (rows or Stripe link) or launch is NOT_READY.
   * When false (default), ledger PARTIAL is only a caveat.
   */
  pilotRequiresLedgerSignal?: boolean;
  /**
   * When true, `Organization.claudeStatus === NOT_ENABLED` does not alone force NOT_READY
   * (Claude treated as intentionally absent for this pilot). Still recorded as caveats.
   */
  treatClaudeAsOptional?: boolean;
};

export type LaunchReadinessReport = {
  orgId: string;
  asOfIso: string;
  launchStatus: LaunchReadinessStatus;
  /** Same read model as `/api/autonomous-ops/readiness` — single source of truth for dimensions. */
  pilotReadiness: PilotReadinessSnapshot;
  /** Rollup excluding obligations + memory from “grade” (empty obligations / memory NO_GO do not block READY alone). */
  launchGrade: {
    summary: ReturnType<typeof rollUpPilotReadiness>['summary'];
    pilotCandidate: boolean;
    blockers: string[];
  };
  reflectionMemory: {
    readiness: 'GO' | 'NO_GO';
    reasons: string[];
  };
  approvalPolicy: {
    settingsRowPresent: boolean;
    maxAutonomyTier: string | null;
    enabledAgents: string[];
  };
  runtimeChecks: {
    executiveBoardBuild: 'ok' | { error: string };
    operationsLogBuild: 'ok' | { error: string };
  };
  connectors: {
    claudeStatus: string;
    /** Registry truth — pilot rows are not DB-backed product state. */
    pilotConnectorRegistryNote: string;
  };
  /** Codes and messages that prevent READY / READY_WITH_CAVEATS. */
  blockers: string[];
  /** Non-fatal gaps (memory NO_GO, empty obligations, optional Claude, etc.). */
  caveats: string[];
};

/**
 * Deterministic launch readiness: reuses `buildPilotReadiness`, verifies executive + operations log builders,
 * and maps to READY / READY_WITH_CAVEATS / NOT_READY without fake green.
 */
export async function buildLaunchReadinessReport(params: BuildLaunchReadinessInput): Promise<LaunchReadinessReport> {
  const now = params.now ?? new Date();
  const pilotReadiness = await buildPilotReadiness({ db: params.db, orgId: params.orgId, now });

  const settingsRow = await params.db.orgAutonomousOpsSettings.findUnique({
    where: { orgId: params.orgId },
    select: { enabledAgents: true, maxAutonomyTier: true },
  });

  const enabledAgents = Array.isArray(settingsRow?.enabledAgents)
    ? (settingsRow!.enabledAgents as string[]).filter(x => typeof x === 'string')
    : [];

  let executiveBoardBuild: LaunchReadinessReport['runtimeChecks']['executiveBoardBuild'] = 'ok';
  try {
    await buildExecutiveBoard({ db: params.db, orgId: params.orgId, take: 5, now });
  } catch (e) {
    executiveBoardBuild = { error: e instanceof Error ? e.message : String(e) };
  }

  let operationsLogBuild: LaunchReadinessReport['runtimeChecks']['operationsLogBuild'] = 'ok';
  try {
    await buildOperationsLog({
      db: params.db,
      orgId: params.orgId,
      take: 1,
      includeObligationSnapshot: true,
      now,
    });
  } catch (e) {
    operationsLogBuild = { error: e instanceof Error ? e.message : String(e) };
  }

  const launchGrade = launchGradeSummary(pilotReadiness.dimensions);
  const candidate = launchPilotCandidate(pilotReadiness.dimensions, params.treatClaudeAsOptional ?? false);

  const blockers: string[] = [];
  const caveats: string[] = [];

  if (!candidate) {
    blockers.push('launch_pilot_candidate_false');
    for (const b of pilotReadiness.overall.blockers) blockers.push(`pilot:${b}`);
  }

  if (executiveBoardBuild !== 'ok') {
    blockers.push(`executive_board_build_failed:${executiveBoardBuild.error}`);
  }
  if (operationsLogBuild !== 'ok') {
    blockers.push(`operations_log_build_failed:${operationsLogBuild.error}`);
  }

  if (params.pilotRequiresLedgerSignal) {
    const ledger = pilotReadiness.dimensions.find(d => d.id === 'donor_volunteer_ledgers');
    if (ledger && ledger.status !== 'READY') {
      blockers.push('pilot_requires_ledger_signal:donor_volunteer_not_ready');
      for (const b of ledger.blockers) blockers.push(`ledger:${b}`);
    }
  }

  const mem = pilotReadiness.memoryEvaluation;
  if (mem.readiness === 'NO_GO') {
    for (const r of mem.reasons) caveats.push(`reflection_memory_no_go:${r}`);
  }

  const ob = pilotReadiness.dimensions.find(d => d.id === 'obligations_snapshot');
  if (ob && ob.status === 'PARTIAL') {
    for (const n of ob.notes) caveats.push(`obligations:${n}`);
  }

  if (params.treatClaudeAsOptional && pilotReadiness.org.claudeStatus === 'NOT_ENABLED') {
    caveats.push('claude_treated_as_optional_by_operator');
  }

  for (const d of pilotReadiness.dimensions) {
    if (d.status === 'PARTIAL' && !LAUNCH_GRADE_EXCLUDE_IDS.has(d.id)) {
      for (const n of d.notes) caveats.push(`${d.id}:${n}`);
    }
  }

  let launchStatus: LaunchReadinessStatus;

  if (blockers.length > 0) {
    launchStatus = 'NOT_READY';
  } else {
    const memoryGo = mem.readiness === 'GO';
    const gradeReady = launchGrade.summary === 'READY';
    if (gradeReady && memoryGo && caveats.length === 0) {
      launchStatus = 'READY';
    } else {
      launchStatus = 'READY_WITH_CAVEATS';
    }
  }

  return {
    orgId: params.orgId,
    asOfIso: pilotReadiness.asOfIso,
    launchStatus,
    pilotReadiness,
    launchGrade: {
      summary: launchGrade.summary,
      pilotCandidate: candidate,
      blockers: launchGrade.blockers,
    },
    reflectionMemory: {
      readiness: mem.readiness,
      reasons: [...mem.reasons],
    },
    approvalPolicy: {
      settingsRowPresent: Boolean(settingsRow),
      maxAutonomyTier: settingsRow?.maxAutonomyTier ?? null,
      enabledAgents,
    },
    runtimeChecks: {
      executiveBoardBuild,
      operationsLogBuild,
    },
    connectors: {
      claudeStatus: pilotReadiness.org.claudeStatus,
      pilotConnectorRegistryNote:
        'MCP, grant-generator, and worker-financial are PILOT registry rows in code — not DB-backed connector truth; see docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md',
    },
    blockers: [...new Set(blockers)],
    caveats: [...new Set(caveats)],
  };
}

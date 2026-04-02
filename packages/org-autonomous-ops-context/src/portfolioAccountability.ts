import type { PrismaClient } from '@magnus/db/types';

const MS_PER_DAY = 86400000;

/** Same horizon as historical executive board copy (~30d); keep in sync with `buildExecutiveBoard` filters. */
export const EXECUTIVE_BOARD_COMPLIANCE_DUE_SOON_DAYS = 30;

const ACTIVE_ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] as const;

export type ComplianceCalendarRowLite = {
  dueDate: Date;
  status: string;
};

/** Not filed and past due (strictly before `now`). */
export function isComplianceOverdueNotFiled(c: ComplianceCalendarRowLite, now: Date): boolean {
  return c.status !== 'FILED' && c.dueDate.getTime() < now.getTime();
}

/**
 * Not filed, not overdue, due within `dueSoonDays` of `now`, and due on or after `now - 1 day`
 * (matches executive / portfolio due-soon window).
 */
export function isComplianceDueSoonNotFiled(
  c: ComplianceCalendarRowLite,
  now: Date,
  dueSoonDays: number,
): boolean {
  if (c.status === 'FILED') return false;
  if (c.dueDate.getTime() < now.getTime()) return false;
  const horizonEnd = new Date(now.getTime() + dueSoonDays * MS_PER_DAY);
  const windowStart = new Date(now.getTime() - MS_PER_DAY);
  return (
    c.dueDate.getTime() <= horizonEnd.getTime() && c.dueDate.getTime() >= windowStart.getTime()
  );
}

/**
 * Classify compliance rows for portfolio rollups. Uses the same predicates as
 * `isComplianceOverdueNotFiled` / `isComplianceDueSoonNotFiled` (executive board lists).
 */
export function partitionComplianceCalendarRows(
  rows: ComplianceCalendarRowLite[],
  now: Date,
  dueSoonDays: number,
): { totalRows: number; overdueNotFiled: number; dueSoonNotFiled: number } {
  let overdueNotFiled = 0;
  let dueSoonNotFiled = 0;
  for (const c of rows) {
    if (isComplianceOverdueNotFiled(c, now)) overdueNotFiled++;
    else if (isComplianceDueSoonNotFiled(c, now, dueSoonDays)) dueSoonNotFiled++;
  }
  return { totalRows: rows.length, overdueNotFiled, dueSoonNotFiled };
}

export type PortfolioAccountabilityRollups = {
  alertsActiveByStatus: Record<string, number>;
  alertsActiveBySeverity: Record<string, number>;
  agentRunsByStatus: Record<string, number>;
  agentRunsRequiresHumanReviewCount: number;
  handoffsOpen: number;
  handoffsOpenRequiresHumanReview: number;
  compliance: {
    totalRows: number;
    overdueNotFiled: number;
    dueSoonNotFiled: number;
  };
};

export type PortfolioAccountabilitySnapshot = {
  asOfIso: string;
  rollups: PortfolioAccountabilityRollups;
  semantics: string[];
  navigationPresets: readonly ControlTowerNavPreset[];
};

export type ControlTowerNavPreset = {
  id: string;
  label: string;
  description: string;
  /** Relative API sub-path under control-tower (alerts | runs). */
  path: 'alerts' | 'runs';
  /** Query params for GET /api/org/autonomous-ops/control-tower/{path}. Omit scopeId to use JWT org default. */
  query: Record<string, string>;
};

/** Stable filter recipes for the existing control-tower list endpoints (no new routes). */
export const PORTFOLIO_CONTROL_TOWER_NAV_PRESETS: readonly ControlTowerNavPreset[] = [
  {
    id: 'org_open_critical_alerts',
    label: 'ORG · OPEN · CRITICAL alerts',
    description: 'Highest-severity open alerts for the current org (scopeId defaults to JWT org).',
    path: 'alerts',
    query: { scopeType: 'ORG', status: 'OPEN', severity: 'CRITICAL' },
  },
  {
    id: 'org_open_high_alerts',
    label: 'ORG · OPEN · HIGH alerts',
    description: 'Open HIGH alerts for the current org.',
    path: 'alerts',
    query: { scopeType: 'ORG', status: 'OPEN', severity: 'HIGH' },
  },
  {
    id: 'org_active_in_progress_alerts',
    label: 'ORG · IN_PROGRESS alerts',
    description: 'Alerts marked in progress (still non-terminal).',
    path: 'alerts',
    query: { scopeType: 'ORG', status: 'IN_PROGRESS' },
  },
  {
    id: 'org_unacknowledged_open_alerts',
    label: 'ORG · OPEN · not yet acknowledged',
    description: 'Open alerts with no acknowledgment timestamp (acknowledged=false).',
    path: 'alerts',
    query: { scopeType: 'ORG', status: 'OPEN', acknowledged: 'false' },
  },
  {
    id: 'org_failed_runs',
    label: 'ORG · FAILED agent runs',
    description: 'Failed runs for the org scope (most recent first; use take= on the request).',
    path: 'runs',
    query: { scopeType: 'ORG', status: 'FAILED' },
  },
  {
    id: 'org_started_runs',
    label: 'ORG · STARTED agent runs',
    description: 'Runs still marked STARTED (may indicate stuck or in-flight work).',
    path: 'runs',
    query: { scopeType: 'ORG', status: 'STARTED' },
  },
] as const;

export async function buildPortfolioAccountabilitySnapshot(params: {
  db: PrismaClient;
  orgId: string;
  now?: Date;
  /** Default 30; must match executive-style due-soon horizon. */
  dueSoonDays?: number;
}): Promise<PortfolioAccountabilitySnapshot> {
  const now = params.now ?? new Date();
  const dueSoonDays = params.dueSoonDays ?? EXECUTIVE_BOARD_COMPLIANCE_DUE_SOON_DAYS;
  const orgId = params.orgId;

  const alertWhere = {
    scopeType: 'ORG' as const,
    scopeId: orgId,
    status: { in: [...ACTIVE_ALERT_STATUSES] },
  };

  const [
    alertsByStatus,
    alertsBySeverity,
    runsByStatus,
    runsHumanReviewCount,
    handoffsOpen,
    handoffsOpenReview,
    complianceRows,
  ] = await Promise.all([
    params.db.alert.groupBy({
      by: ['status'],
      where: alertWhere,
      _count: { _all: true },
    }),
    params.db.alert.groupBy({
      by: ['severity'],
      where: alertWhere,
      _count: { _all: true },
    }),
    params.db.agentRun.groupBy({
      by: ['status'],
      where: { scopeType: 'ORG', scopeId: orgId },
      _count: { _all: true },
    }),
    params.db.agentRun.count({
      where: { scopeType: 'ORG', scopeId: orgId, requiresHumanReview: true },
    }),
    params.db.agentHandoff.count({ where: { orgId, status: 'OPEN' } }),
    params.db.agentHandoff.count({ where: { orgId, status: 'OPEN', requiresHumanReview: true } }),
    params.db.complianceCalendar.findMany({
      where: { orgId },
      select: { dueDate: true, status: true },
    }),
  ]);

  const compliance = partitionComplianceCalendarRows(complianceRows, now, dueSoonDays);

  const alertsActiveByStatus: Record<string, number> = {};
  for (const r of alertsByStatus) {
    alertsActiveByStatus[r.status] = (alertsActiveByStatus[r.status] ?? 0) + r._count._all;
  }
  const alertsActiveBySeverity: Record<string, number> = {};
  for (const r of alertsBySeverity) {
    alertsActiveBySeverity[r.severity] = (alertsActiveBySeverity[r.severity] ?? 0) + r._count._all;
  }
  const agentRunsByStatus: Record<string, number> = {};
  for (const r of runsByStatus) {
    agentRunsByStatus[r.status] = (agentRunsByStatus[r.status] ?? 0) + r._count._all;
  }

  return {
    asOfIso: now.toISOString(),
    rollups: {
      alertsActiveByStatus,
      alertsActiveBySeverity,
      agentRunsByStatus,
      agentRunsRequiresHumanReviewCount: runsHumanReviewCount,
      handoffsOpen,
      handoffsOpenRequiresHumanReview: handoffsOpenReview,
      compliance: {
        totalRows: compliance.totalRows,
        overdueNotFiled: compliance.overdueNotFiled,
        dueSoonNotFiled: compliance.dueSoonNotFiled,
      },
    },
    semantics: [
      'Rollups are ORG-scoped counts from existing Alert, AgentRun, AgentHandoff, and ComplianceCalendar rows only.',
      'Zero compliance calendar rows means none recorded in this system, not a claim that no filings apply.',
      'No cross-org portfolio, partner comparison, or composite health score is computed.',
      'Navigation presets map to existing control-tower list query parameters; omit scopeId to use the JWT org default.',
    ],
    navigationPresets: PORTFOLIO_CONTROL_TOWER_NAV_PRESETS,
  };
}

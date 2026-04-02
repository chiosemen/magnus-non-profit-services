import type { PrismaClient } from '@magnus/db/types';
import type { Severity } from './executiveSemantics';

export type FinancialSummary = {
  asOfIso: string;
  sentinelActiveAlerts: Array<{
    id: string;
    type: string;
    severity: Severity;
    status: string;
    title: string;
    body: string;
    createdAtIso: string;
    dedupeKey: string;
  }>;
  grants: Array<{
    id: string;
    funderName: string;
    totalAmount: number;
    spentToDate: number;
    startDateIso: string;
    endDateIso: string;
  }>;
  disclaimers: string[];
};

const SENTINEL_ALERT_TYPES = [
  'CASH_RUNWAY_LOW',
  'CASH_RUNWAY_UNAVAILABLE',
  'RESTRICTED_FUNDS_TIMING_RISK',
  'GRANT_UNDERSPEND_PACE',
  'GRANT_OVERSPEND_PACE',
] as const;

export async function buildFinancialSummary(params: {
  db: PrismaClient;
  orgId: string;
  takeAlerts?: number;
  takeGrants?: number;
  now?: Date;
}): Promise<FinancialSummary> {
  const now = params.now ?? new Date();
  const takeAlerts = Math.min(params.takeAlerts ?? 50, 200);
  const takeGrants = Math.min(params.takeGrants ?? 200, 500);

  const [alerts, grants] = await Promise.all([
    params.db.alert.findMany({
      where: {
        scopeType: 'ORG',
        scopeId: params.orgId,
        agentName: 'FinancialSentinel',
        status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
        type: { in: [...SENTINEL_ALERT_TYPES] },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: takeAlerts,
      select: {
        id: true,
        type: true,
        severity: true,
        status: true,
        title: true,
        body: true,
        createdAt: true,
        dedupeKey: true,
      },
    }),
    params.db.grant.findMany({
      where: { orgId: params.orgId },
      orderBy: [{ endDate: 'desc' }, { startDate: 'asc' }, { id: 'asc' }],
      take: takeGrants,
      select: {
        id: true,
        funderName: true,
        totalAmount: true,
        spentToDate: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  return {
    asOfIso: now.toISOString(),
    sentinelActiveAlerts: alerts.map(a => ({
      id: a.id,
      type: a.type,
      severity: a.severity as Severity,
      status: a.status,
      title: a.title,
      body: a.body,
      createdAtIso: a.createdAt.toISOString(),
      dedupeKey: a.dedupeKey,
    })),
    grants: grants.map(g => ({
      id: g.id,
      funderName: g.funderName,
      totalAmount: Number(g.totalAmount),
      spentToDate: Number(g.spentToDate),
      startDateIso: g.startDate.toISOString(),
      endDateIso: g.endDate.toISOString(),
    })),
    disclaimers: [
      'Projection-only financial surface: shows persisted SENTINEL alerts and grant record snapshots.',
      'No financial health score is computed. Verify with authoritative accounting records before action.',
    ],
  };
}


import type { AlertSeverity, AlertStatus, AgentHandoffStatus, PrismaClient } from '@magnus/db/types';
import type { Destination, Severity } from './executiveSemantics';
import { isKnownSeverity, severityRank } from './executiveSemantics';

export type ObligationKind = 'alert' | 'handoff' | 'compliance_calendar';

export type ActiveObligation = {
  kind: ObligationKind;
  id: string;
  sourceModule: 'alerts' | 'handoffs' | 'compliance_calendar';
  severity: Severity | null;
  status: string;
  title: string;
  why: string;
  createdAtIso?: string;
  dueDateIso?: string;
  destination: Destination;
  evidence: Array<{ label: string; destination: Destination }>;
  linkage?: { relatedAlertId?: string; relatedHandoffId?: string; relatedAgentRunId?: string };
  requiresHumanReview: boolean | null;
};

const ACTIVE_ALERT_STATUSES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];
const ACTIVE_HANDOFF_STATUSES: AgentHandoffStatus[] = ['OPEN', 'ACKNOWLEDGED'];

function uiDest(href: string): Destination {
  return { href, status: 'UNIMPLEMENTED_IN_REPO' };
}

function maxSeverity(values: Severity[]): Severity {
  if (values.includes('CRITICAL')) return 'CRITICAL';
  if (values.includes('HIGH')) return 'HIGH';
  if (values.includes('MED')) return 'MED';
  return 'LOW';
}

function complianceSeverity(dueDate: Date, now: Date): Severity {
  return dueDate < now ? 'HIGH' : 'MED';
}

function isBoardPrepAlert(a: { type: string; agentName: string }): boolean {
  // Narrow, deterministic first slice: ORACLE board-prep alert types.
  return (
    a.agentName === 'BoardIntelligenceOracle' &&
    (a.type === 'BOARD_WEEKLY_EXEC_SUMMARY' || a.type === 'BOARD_PRE_BOARD_BRIEFING')
  );
}

export async function buildActiveObligations(params: {
  db: PrismaClient;
  orgId: string;
  take?: number;
  now?: Date;
  dueSoonDays?: number;
}): Promise<ActiveObligation[]> {
  const now = params.now ?? new Date();
  const take = params.take ?? 50;
  const dueSoonDays = params.dueSoonDays ?? 30;
  const inSoon = new Date(now.getTime() + dueSoonDays * 86400000);

  const [alerts, handoffs, compliance] = await Promise.all([
    params.db.alert.findMany({
      where: {
        scopeType: 'ORG',
        scopeId: params.orgId,
        status: { in: ACTIVE_ALERT_STATUSES },
      },
      select: {
        id: true,
        agentName: true,
        type: true,
        title: true,
        severity: true,
        status: true,
        createdAt: true,
        relatedAgentRunId: true,
        relatedHandoffId: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    params.db.agentHandoff.findMany({
      where: { orgId: params.orgId, status: { in: ACTIVE_HANDOFF_STATUSES } },
      select: { id: true, title: true, fromAgentName: true, status: true, createdAt: true, requiresHumanReview: true, relatedAgentRunId: true },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    params.db.complianceCalendar.findMany({
      where: { orgId: params.orgId, status: { not: 'FILED' }, dueDate: { lte: inSoon } },
      select: { id: true, deadlineType: true, status: true, dueDate: true, createdAt: true },
      orderBy: { dueDate: 'asc' },
      take,
    }),
  ]);

  const out: ActiveObligation[] = [];

  for (const a of alerts) {
    if (!isKnownSeverity(a.severity)) throw new Error('UNKNOWN_ALERT_SEVERITY');
    if (!isBoardPrepAlert(a)) continue;
    out.push({
      kind: 'alert',
      id: a.id,
      sourceModule: 'alerts',
      severity: a.severity,
      status: a.status,
      title: a.title,
      why: `${a.type}: ${a.title}`,
      createdAtIso: a.createdAt.toISOString(),
      destination: uiDest(`/app/autonomous-ops/alerts/${a.id}`),
      evidence: [
        { label: 'Alert audit trail', destination: { href: `/api/org/autonomous-ops/alerts/${a.id}/audit`, status: 'IMPLEMENTED' } },
      ],
      linkage: {
        relatedAgentRunId: a.relatedAgentRunId ?? undefined,
        relatedHandoffId: a.relatedHandoffId ?? undefined,
      },
      requiresHumanReview: null,
    });
  }

  for (const h of handoffs) {
    out.push({
      kind: 'handoff',
      id: h.id,
      sourceModule: 'handoffs',
      severity: null,
      status: h.status,
      title: h.title,
      why: `${h.fromAgentName}: ${h.title}`,
      createdAtIso: h.createdAt.toISOString(),
      destination: uiDest(`/app/autonomous-ops/handoffs/${h.id}`),
      evidence: [
        { label: 'Handoff audit trail', destination: { href: `/api/org/autonomous-ops/handoffs/${h.id}/audit`, status: 'IMPLEMENTED' } },
      ],
      linkage: {
        relatedAgentRunId: h.relatedAgentRunId ?? undefined,
      },
      requiresHumanReview: h.requiresHumanReview,
    });
  }

  for (const c of compliance) {
    const sev = complianceSeverity(c.dueDate, now);
    out.push({
      kind: 'compliance_calendar',
      id: c.id,
      sourceModule: 'compliance_calendar',
      severity: sev,
      status: c.status,
      title: `${c.deadlineType}`,
      why: `${c.deadlineType} due ${c.dueDate.toISOString().slice(0, 10)} (${c.status})`,
      dueDateIso: c.dueDate.toISOString(),
      destination: uiDest(`/app/compliance/${c.id}`),
      evidence: [
        { label: 'Compliance calendar row', destination: { href: `/api/org/compliance`, status: 'IMPLEMENTED' } },
      ],
      requiresHumanReview: null,
    });
  }

  // Deterministic ordering: severity desc (null last), then dueDate/createdAt (soonest/highest urgency), then stable by id.
  out.sort((a, b) => {
    const sevA = a.severity ? severityRank(a.severity) : 0;
    const sevB = b.severity ? severityRank(b.severity) : 0;
    const sev = sevB - sevA;
    if (sev !== 0) return sev;

    const timeA = a.dueDateIso ? new Date(a.dueDateIso).getTime() : a.createdAtIso ? new Date(a.createdAtIso).getTime() : 0;
    const timeB = b.dueDateIso ? new Date(b.dueDateIso).getTime() : b.createdAtIso ? new Date(b.createdAtIso).getTime() : 0;

    // For compliance items, earlier due dates should surface first; for createdAt-driven items, newer surfaces first.
    const isDueA = Boolean(a.dueDateIso);
    const isDueB = Boolean(b.dueDateIso);
    if (isDueA && isDueB) return timeA - timeB;
    if (!isDueA && !isDueB) return timeB - timeA;
    if (isDueA && !isDueB) return -1;
    return 1;
  });

  // De-duplicate by (kind,id) and cap.
  const seen = new Set<string>();
  const capped: ActiveObligation[] = [];
  for (const item of out) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    capped.push(item);
    if (capped.length >= take) break;
  }

  // Module-level severity for handoffs can be inferred only if we already have other severities; do not invent. Keep null.
  // Return capped obligations.
  return capped;
}


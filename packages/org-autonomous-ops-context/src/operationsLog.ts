import type { AlertStatus, AgentHandoffStatus, PrismaClient } from '@magnus/db/types';
import { buildActiveObligations } from './activeObligations';

export type OperationsLogRowType =
  | 'ALERT_CREATED'
  | 'ALERT_STATUS_CHANGED'
  | 'ALERT_OWNER_CHANGED'
  | 'ALERT_LINKED'
  | 'HANDOFF_CREATED'
  | 'HANDOFF_STATUS_CHANGED'
  | 'AGENT_RUN_STARTED'
  | 'AGENT_RUN_SUCCESS'
  | 'AGENT_RUN_FAILED'
  | 'AUTONOMY_BLOCKED_INTERNAL_EFFECT'
  | 'OBLIGATION_SURFACED_SNAPSHOT';

export type OperationsLogActorKind = 'AUTOMATIC' | 'HUMAN_ACTION' | 'DERIVED_SNAPSHOT';

export type OperationsLogEvidenceLink = {
  label: string;
  href: string;
  status: 'IMPLEMENTED' | 'UNIMPLEMENTED_IN_REPO';
};

export type OperationsLogPrimaryRef =
  | { kind: 'alert'; id: string }
  | { kind: 'handoff'; id: string }
  | { kind: 'agent_run'; id: string }
  | { kind: 'obligation'; id: string };

export type OperationsLogRow = {
  id: string;
  occurredAtIso: string;
  type: OperationsLogRowType;
  summary: string;
  automaticOrHuman: OperationsLogActorKind;
  primary: OperationsLogPrimaryRef;
  agentName?: string | null;
  statusBefore?: string | null;
  statusAfter?: string | null;
  requiresHumanReview?: boolean | null;
  evidenceLinks: OperationsLogEvidenceLink[];
  limitations?: string[] | null;
};

export type BuildOperationsLogInput = {
  db: PrismaClient;
  orgId: string;
  take?: number;
  since?: Date | null;
  until?: Date | null;
  types?: OperationsLogRowType[] | null;
  agentNames?: string[] | null;
  /** Optional status filter applied where meaningful (alerts/handoffs). */
  status?: (AlertStatus | AgentHandoffStatus)[] | null;
  includeObligationSnapshot?: boolean;
  now?: Date;
};

function clampTake(raw: number | undefined): number {
  const n = raw ?? 100;
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(Math.floor(n), 200);
}

function iso(d: Date): string {
  return d.toISOString();
}

function inWindow(d: Date, since: Date | null, until: Date | null): boolean {
  if (since && d < since) return false;
  if (until && d > until) return false;
  return true;
}

function wantsType(filter: Set<OperationsLogRowType> | null, t: OperationsLogRowType): boolean {
  return filter ? filter.has(t) : true;
}

function wantsAgent(filter: Set<string> | null, agentName: string | null | undefined): boolean {
  if (!filter) return true;
  const a = agentName ?? '';
  return filter.has(a);
}

export async function buildOperationsLog(input: BuildOperationsLogInput): Promise<{
  orgId: string;
  asOfIso: string;
  take: number;
  rows: OperationsLogRow[];
  disclaimers: string[];
}> {
  const take = clampTake(input.take);
  const now = input.now ?? new Date();
  const since = input.since ?? null;
  const until = input.until ?? null;
  const typeFilter = input.types && input.types.length > 0 ? new Set(input.types) : null;
  const agentFilter = input.agentNames && input.agentNames.length > 0 ? new Set(input.agentNames) : null;

  // Pull more than `take` per source, then merge+filter deterministically.
  const pullN = Math.min(200, Math.max(take * 2, 100));

  const [alertAudits, handoffAudits, runs, obligations] = await Promise.all([
    input.db.alertAuditEntry.findMany({
      where: {
        alert: { scopeType: 'ORG', scopeId: input.orgId } as any,
        ...(since || until
          ? {
              createdAt: {
                ...(since ? { gte: since } : {}),
                ...(until ? { lte: until } : {}),
              },
            }
          : {}),
      } as any,
      orderBy: { createdAt: 'desc' },
      take: pullN,
      select: {
        id: true,
        alertId: true,
        createdAt: true,
        action: true,
        fromStatus: true,
        toStatus: true,
        actorType: true,
        actorName: true,
        detail: true,
        alert: { select: { agentName: true, type: true, title: true, status: true } } as any,
      } as any,
    }),
    input.db.agentHandoffAuditEntry.findMany({
      where: {
        handoff: { orgId: input.orgId } as any,
        ...(since || until
          ? {
              createdAt: {
                ...(since ? { gte: since } : {}),
                ...(until ? { lte: until } : {}),
              },
            }
          : {}),
      } as any,
      orderBy: { createdAt: 'desc' },
      take: pullN,
      select: {
        id: true,
        handoffId: true,
        createdAt: true,
        action: true,
        fromStatus: true,
        toStatus: true,
        actorType: true,
        actorName: true,
        detail: true,
        handoff: {
          select: {
            fromAgentName: true,
            toAgentName: true,
            title: true,
            status: true,
            requiresHumanReview: true,
            relatedAgentRunId: true,
          },
        } as any,
      } as any,
    }),
    input.db.agentRun.findMany({
      where: {
        scopeType: 'ORG',
        scopeId: input.orgId,
        ...(since || until
          ? {
              startedAt: {
                ...(since ? { gte: since } : {}),
                ...(until ? { lte: until } : {}),
              },
            }
          : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: pullN,
      select: {
        id: true,
        agentName: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        error: true,
        metrics: true,
        autonomyTier: true,
        requiresHumanReview: true,
      },
    }),
    input.includeObligationSnapshot === false
      ? Promise.resolve([])
      : buildActiveObligations({ db: input.db, orgId: input.orgId, take: Math.min(50, pullN), now }),
  ]);

  const out: OperationsLogRow[] = [];

  for (const a of alertAudits as any[]) {
    const occurredAt = a.createdAt as Date;
    if (!inWindow(occurredAt, since, until)) continue;
    const agentName = String(a.alert?.agentName ?? '');
    if (!wantsAgent(agentFilter, agentName)) continue;

    const action = String(a.action ?? '');
    const isCreated = action === 'CREATED';
    const isStatus = action === 'STATUS_CHANGED';
    const isOwner = action === 'OWNER_ASSIGNED' || action === 'OWNER_CLEARED';
    const isLinked = action === 'LINKED';

    const type: OperationsLogRowType | null = isCreated
      ? 'ALERT_CREATED'
      : isStatus
        ? 'ALERT_STATUS_CHANGED'
        : isOwner
          ? 'ALERT_OWNER_CHANGED'
          : isLinked
            ? 'ALERT_LINKED'
            : null;
    if (!type) continue;
    if (!wantsType(typeFilter, type)) continue;

    const automaticOrHuman: OperationsLogActorKind = a.actorType === 'user' ? 'HUMAN_ACTION' : 'AUTOMATIC';
    const label = a.alert?.title ? String(a.alert.title) : 'Alert';
    const alertType = a.alert?.type ? String(a.alert.type) : 'ALERT';
    const summary =
      type === 'ALERT_CREATED'
        ? `Alert created: ${label}`
        : type === 'ALERT_STATUS_CHANGED'
          ? `Alert status changed: ${label}`
          : type === 'ALERT_OWNER_CHANGED'
            ? `Alert owner updated: ${label}`
            : `Alert linkage updated: ${label}`;

    out.push({
      id: `alert_audit:${a.id}`,
      occurredAtIso: iso(occurredAt),
      type,
      summary: `${summary} (${alertType})`,
      automaticOrHuman,
      primary: { kind: 'alert', id: a.alertId },
      agentName,
      statusBefore: a.fromStatus ?? null,
      statusAfter: a.toStatus ?? null,
      evidenceLinks: [
        { label: 'Alert', href: `/api/org/autonomous-ops/alerts/${a.alertId}`, status: 'IMPLEMENTED' },
        { label: 'Alert audit trail', href: `/api/org/autonomous-ops/alerts/${a.alertId}/audit`, status: 'IMPLEMENTED' },
      ],
    });
  }

  for (const h of handoffAudits as any[]) {
    const occurredAt = h.createdAt as Date;
    if (!inWindow(occurredAt, since, until)) continue;
    const agentName = h.handoff?.fromAgentName ? String(h.handoff.fromAgentName) : null;
    if (!wantsAgent(agentFilter, agentName)) continue;

    const action = String(h.action ?? '');
    const type: OperationsLogRowType | null =
      action === 'CREATED' ? 'HANDOFF_CREATED' : action === 'STATUS_CHANGED' ? 'HANDOFF_STATUS_CHANGED' : null;
    if (!type) continue;
    if (!wantsType(typeFilter, type)) continue;

    const automaticOrHuman: OperationsLogActorKind = h.actorType === 'user' ? 'HUMAN_ACTION' : 'AUTOMATIC';
    const title = h.handoff?.title ? String(h.handoff.title) : 'Handoff';
    const toAgent = h.handoff?.toAgentName ? String(h.handoff.toAgentName) : 'staff';
    const summary =
      type === 'HANDOFF_CREATED'
        ? `Handoff created for ${toAgent}: ${title}`
        : `Handoff status changed for ${toAgent}: ${title}`;

    out.push({
      id: `handoff_audit:${h.id}`,
      occurredAtIso: iso(occurredAt),
      type,
      summary,
      automaticOrHuman,
      primary: { kind: 'handoff', id: h.handoffId },
      agentName,
      statusBefore: h.fromStatus ?? null,
      statusAfter: h.toStatus ?? null,
      requiresHumanReview: Boolean(h.handoff?.requiresHumanReview),
      evidenceLinks: [
        { label: 'Handoff', href: `/api/org/autonomous-ops/handoffs/${h.handoffId}`, status: 'IMPLEMENTED' },
        { label: 'Handoff audit trail', href: `/api/org/autonomous-ops/handoffs/${h.handoffId}/audit`, status: 'IMPLEMENTED' },
      ],
    });
  }

  for (const r of runs as any[]) {
    const occurredAt = (r.finishedAt ?? r.startedAt) as Date;
    if (!inWindow(occurredAt, since, until)) continue;
    const agentName = String(r.agentName ?? '');
    if (!wantsAgent(agentFilter, agentName)) continue;

    const status = String(r.status ?? '');
    const type: OperationsLogRowType =
      status === 'SUCCESS' ? 'AGENT_RUN_SUCCESS' : status === 'FAILED' ? 'AGENT_RUN_FAILED' : 'AGENT_RUN_STARTED';
    if (!wantsType(typeFilter, type)) continue;

    out.push({
      id: `agent_run:${r.id}:${type}`,
      occurredAtIso: iso(occurredAt),
      type,
      summary:
        type === 'AGENT_RUN_STARTED'
          ? `Agent run started: ${agentName}`
          : type === 'AGENT_RUN_SUCCESS'
            ? `Agent run succeeded: ${agentName}`
            : `Agent run failed: ${agentName}`,
      automaticOrHuman: 'AUTOMATIC',
      primary: { kind: 'agent_run', id: r.id },
      agentName,
      statusAfter: status,
      requiresHumanReview: Boolean(r.requiresHumanReview),
      evidenceLinks: [
        { label: 'Agent run (id)', href: `/api/org/autonomous-ops/agent-runs/${r.id}`, status: 'UNIMPLEMENTED_IN_REPO' },
      ],
      limitations: type === 'AGENT_RUN_FAILED' && r.metrics && (r.metrics as any).autonomyTrace
        ? [
            'This run includes a structured autonomyTrace (blocked internal effect). No external approval workflow is implied.',
          ]
        : null,
    });

    const trace = r.metrics && (r.metrics as any).autonomyTrace ? (r.metrics as any).autonomyTrace : null;
    if (trace && trace.decision === 'BLOCKED_INTERNAL_EFFECT') {
      if (wantsType(typeFilter, 'AUTONOMY_BLOCKED_INTERNAL_EFFECT')) {
        out.push({
          id: `agent_run:${r.id}:autonomy_blocked`,
          occurredAtIso: iso(occurredAt),
          type: 'AUTONOMY_BLOCKED_INTERNAL_EFFECT',
          summary: `Blocked internal effect (${String(trace.effect ?? 'unknown')}): ${String(trace.reasonCode ?? '')}`,
          automaticOrHuman: 'AUTOMATIC',
          primary: { kind: 'agent_run', id: r.id },
          agentName,
          evidenceLinks: [
            { label: 'Agent run (id)', href: `/api/org/autonomous-ops/agent-runs/${r.id}`, status: 'UNIMPLEMENTED_IN_REPO' },
          ],
          limitations: [
            'This indicates an internal handoff/memory persistence gate was blocked. It does not represent an external action approval/rejection.',
          ],
        });
      }
    }
  }

  if (input.includeObligationSnapshot !== false) {
    for (const o of obligations as any[]) {
      const occurredAt = now;
      if (!inWindow(occurredAt, since, until)) continue;
      if (!wantsType(typeFilter, 'OBLIGATION_SURFACED_SNAPSHOT')) continue;
      const agentName = o.linkage?.relatedAgentRunId ? null : o.sourceModule === 'handoffs' ? null : null;
      if (!wantsAgent(agentFilter, agentName)) continue;

      const id = `obligation_snapshot:${String(o.kind)}:${String(o.id)}:${iso(now)}`;
      out.push({
        id,
        occurredAtIso: iso(now),
        type: 'OBLIGATION_SURFACED_SNAPSHOT',
        summary: `Active obligation (snapshot): ${String(o.why ?? o.title ?? '')}`.trim(),
        automaticOrHuman: 'DERIVED_SNAPSHOT',
        primary: { kind: 'obligation', id: `${String(o.kind)}:${String(o.id)}` },
        agentName: null,
        statusAfter: String(o.status ?? ''),
        requiresHumanReview: o.requiresHumanReview ?? null,
        evidenceLinks: Array.isArray(o.evidence)
          ? o.evidence.map((e: any) => ({
              label: String(e.label ?? 'Evidence'),
              href: String(e.destination?.href ?? ''),
              status: (e.destination?.status === 'IMPLEMENTED' ? 'IMPLEMENTED' : 'UNIMPLEMENTED_IN_REPO') as any,
            }))
          : [],
        limitations: [
          `Derived view as of ${iso(now)}; obligations are not stored historically as events.`,
        ],
      });
    }
  }

  // Final pass: sort desc by timestamp, then stable by id; apply cap.
  out.sort((a, b) => (a.occurredAtIso === b.occurredAtIso ? a.id.localeCompare(b.id) : b.occurredAtIso.localeCompare(a.occurredAtIso)));

  const capped = out.slice(0, take);

  return {
    orgId: input.orgId,
    asOfIso: iso(now),
    take,
    rows: capped,
    disclaimers: [
      'Operations log is a derived read model built from persisted alerts, handoffs, audits, and agent runs.',
      'No external approval workflow is implied; “requiresHumanReview” is a triage gate and “RESOLVED” is workflow closure with evidence.',
      'Obligation rows are derived snapshots, not a historical event ledger.',
    ],
  };
}


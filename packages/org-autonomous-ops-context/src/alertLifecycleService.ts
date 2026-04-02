import type { AlertOwnerType, AlertStatus, Prisma, PrismaClient } from '@magnus/db/types';

export const ALERT_AUDIT_ACTIONS = {
  CREATED: 'CREATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  OWNER_ASSIGNED: 'OWNER_ASSIGNED',
  OWNER_CLEARED: 'OWNER_CLEARED',
  LINKED: 'LINKED',
} as const;

const ALLOWED_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['RESOLVED', 'CANCELLED'],
  RESOLVED: [],
  CANCELLED: [],
};

export type TransitionAlertInput = {
  alertId: string;
  toStatus: AlertStatus;
  actorType: 'agent' | 'user' | 'system';
  actorName?: string | null;
  resolutionSummary?: string | null;
  detail?: Record<string, unknown> | null;
};

export type SetAlertOwnerInput =
  | {
      alertId: string;
      ownerType: AlertOwnerType;
      ownerId?: string | null;
      ownerName: string;
      actorType: 'agent' | 'user' | 'system';
      actorName?: string | null;
      detail?: Record<string, unknown> | null;
    }
  | {
      alertId: string;
      ownerType: null;
      actorType: 'agent' | 'user' | 'system';
      actorName?: string | null;
      detail?: Record<string, unknown> | null;
    };

export type LinkAlertInput = {
  alertId: string;
  relatedAgentRunId?: string | null;
  relatedHandoffId?: string | null;
  actorType: 'agent' | 'user' | 'system';
  actorName?: string | null;
  detail?: Record<string, unknown> | null;
};

export class AlertLifecycleService {
  constructor(private readonly db: PrismaClient) {}

  private async assertOrgExists(orgId: string): Promise<void> {
    const o = await this.db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!o) throw new Error('ORG_NOT_FOUND');
  }

  private async assertAlertInOrg(orgId: string, alertId: string) {
    const a = await this.db.alert.findUnique({
      where: { id: alertId },
      select: {
        id: true,
        scopeType: true,
        scopeId: true,
        status: true,
        acknowledgedAt: true,
        resolvedAt: true,
        resolutionSummary: true,
      },
    });
    if (!a) throw new Error('ALERT_NOT_FOUND');

    if (a.scopeType === 'ORG') {
      if (a.scopeId !== orgId) throw new Error('ALERT_FORBIDDEN');
      return a;
    }
    if (a.scopeType === 'GRANT') {
      const g = await this.db.grant.findUnique({ where: { id: a.scopeId }, select: { orgId: true } });
      if (!g || g.orgId !== orgId) throw new Error('ALERT_FORBIDDEN');
      return a;
    }
    if (a.scopeType === 'WORKER') {
      const rel = await this.db.workerOrgRelationship.findFirst({
        where: { workerId: a.scopeId, orgId },
        select: { id: true },
      });
      if (!rel) throw new Error('ALERT_FORBIDDEN');
      return a;
    }
    throw new Error('ALERT_FORBIDDEN');
  }

  private async assertRelatedRunAuthorized(orgId: string, runId: string): Promise<void> {
    const run = await this.db.agentRun.findUnique({ where: { id: runId }, select: { scopeType: true, scopeId: true } });
    if (!run) throw new Error('INVALID_RELATED_RUN');

    if (run.scopeType === 'ORG') {
      if (run.scopeId !== orgId) throw new Error('INVALID_RELATED_RUN');
      return;
    }
    if (run.scopeType === 'GRANT') {
      const g = await this.db.grant.findUnique({ where: { id: run.scopeId }, select: { orgId: true } });
      if (!g || g.orgId !== orgId) throw new Error('INVALID_RELATED_RUN');
      return;
    }
    if (run.scopeType === 'WORKER') {
      const rel = await this.db.workerOrgRelationship.findFirst({ where: { workerId: run.scopeId, orgId }, select: { id: true } });
      if (!rel) throw new Error('INVALID_RELATED_RUN');
      return;
    }
    throw new Error('INVALID_RELATED_RUN');
  }

  private async assertRelatedHandoffAuthorized(orgId: string, handoffId: string): Promise<void> {
    const h = await this.db.agentHandoff.findFirst({ where: { id: handoffId, orgId }, select: { id: true } });
    if (!h) throw new Error('INVALID_RELATED_HANDOFF');
  }

  async transition(orgId: string, input: TransitionAlertInput) {
    await this.assertOrgExists(orgId);
    const a = await this.assertAlertInOrg(orgId, input.alertId);

    const allowed = ALLOWED_TRANSITIONS[a.status];
    if (!allowed.includes(input.toStatus)) throw new Error('INVALID_TRANSITION');

    const now = new Date();
    const to = input.toStatus;
    const resolutionSummary = input.resolutionSummary?.trim() ?? null;
    if (to === 'RESOLVED' && (!resolutionSummary || resolutionSummary.length < 3)) {
      throw new Error('RESOLUTION_REQUIRED');
    }

    const updated = await this.db.alert.update({
      where: { id: a.id },
      data: {
        status: to,
        acknowledgedAt: to === 'ACKNOWLEDGED' && !a.acknowledgedAt ? now : a.acknowledgedAt,
        resolvedAt: to === 'RESOLVED' || to === 'CANCELLED' ? now : a.resolvedAt,
        resolutionSummary: to === 'RESOLVED' ? resolutionSummary : a.resolutionSummary,
      },
    });

    await this.db.alertAuditEntry.create({
      data: {
        alertId: a.id,
        action: ALERT_AUDIT_ACTIONS.STATUS_CHANGED,
        fromStatus: a.status,
        toStatus: to,
        actorType: input.actorType,
        actorName: input.actorName ?? undefined,
        detail: input.detail === undefined || input.detail === null ? undefined : (input.detail as Prisma.InputJsonValue),
      },
    });

    return updated;
  }

  async setOwner(orgId: string, input: SetAlertOwnerInput) {
    await this.assertOrgExists(orgId);
    const a = await this.assertAlertInOrg(orgId, input.alertId);

    const nowOwnerType = input.ownerType;
    if (nowOwnerType === null) {
      const updated = await this.db.alert.update({
        where: { id: a.id },
        data: { ownerType: null, ownerId: null, ownerName: null },
      });
      await this.db.alertAuditEntry.create({
        data: {
          alertId: a.id,
          action: ALERT_AUDIT_ACTIONS.OWNER_CLEARED,
          fromStatus: null,
          toStatus: null,
          actorType: input.actorType,
          actorName: input.actorName ?? undefined,
          detail: input.detail === undefined || input.detail === null ? undefined : (input.detail as Prisma.InputJsonValue),
        },
      });
      return updated;
    }

    const ownerName = input.ownerName.trim();
    if (!ownerName) throw new Error('OWNER_NAME_REQUIRED');

    const updated = await this.db.alert.update({
      where: { id: a.id },
      data: {
        ownerType: nowOwnerType,
        ownerId: input.ownerId ?? null,
        ownerName,
      },
    });
    await this.db.alertAuditEntry.create({
      data: {
        alertId: a.id,
        action: ALERT_AUDIT_ACTIONS.OWNER_ASSIGNED,
        fromStatus: null,
        toStatus: null,
        actorType: input.actorType,
        actorName: input.actorName ?? undefined,
        detail: input.detail === undefined || input.detail === null ? undefined : (input.detail as Prisma.InputJsonValue),
      },
    });
    return updated;
  }

  async link(orgId: string, input: LinkAlertInput) {
    await this.assertOrgExists(orgId);
    const a = await this.assertAlertInOrg(orgId, input.alertId);

    if (input.relatedAgentRunId) await this.assertRelatedRunAuthorized(orgId, input.relatedAgentRunId);
    if (input.relatedHandoffId) await this.assertRelatedHandoffAuthorized(orgId, input.relatedHandoffId);

    const updated = await this.db.alert.update({
      where: { id: a.id },
      data: {
        relatedAgentRunId: input.relatedAgentRunId === undefined ? undefined : input.relatedAgentRunId,
        relatedHandoffId: input.relatedHandoffId === undefined ? undefined : input.relatedHandoffId,
      },
    });

    await this.db.alertAuditEntry.create({
      data: {
        alertId: a.id,
        action: ALERT_AUDIT_ACTIONS.LINKED,
        fromStatus: null,
        toStatus: null,
        actorType: input.actorType,
        actorName: input.actorName ?? undefined,
        detail: input.detail === undefined || input.detail === null ? undefined : (input.detail as Prisma.InputJsonValue),
      },
    });

    return updated;
  }

  async listAudit(orgId: string, alertId: string) {
    await this.assertAlertInOrg(orgId, alertId);
    return this.db.alertAuditEntry.findMany({ where: { alertId }, orderBy: { createdAt: 'asc' } });
  }
}


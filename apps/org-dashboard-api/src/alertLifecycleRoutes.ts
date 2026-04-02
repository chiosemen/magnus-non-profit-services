import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { AlertOwnerType, AlertStatus, PrismaClient } from '@magnus/db/types';
import { AlertLifecycleService } from '@magnus/org-autonomous-ops-context';

const ALERT_STATUSES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];
const OWNER_TYPES: AlertOwnerType[] = ['USER', 'AGENT', 'SYSTEM'];

function parseAlertStatus(raw: unknown): AlertStatus | null {
  if (typeof raw !== 'string') return null;
  return ALERT_STATUSES.includes(raw as AlertStatus) ? (raw as AlertStatus) : null;
}

function parseOwnerType(raw: unknown): AlertOwnerType | null {
  if (typeof raw !== 'string') return null;
  return OWNER_TYPES.includes(raw as AlertOwnerType) ? (raw as AlertOwnerType) : null;
}

function parseTake(raw: unknown): number {
  const n = raw === undefined ? NaN : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 200);
}

function parseIsoDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function serializeAlert(a: {
  id: string;
  agentName: string;
  scopeType: string;
  scopeId: string;
  severity: unknown;
  status: AlertStatus;
  type: string;
  title: string;
  body: string;
  recommendedActions: unknown;
  dedupeKey: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolutionSummary: string | null;
  ownerType: AlertOwnerType | null;
  ownerId: string | null;
  ownerName: string | null;
  relatedAgentRunId: string | null;
  relatedHandoffId: string | null;
}) {
  return {
    id: a.id,
    agentName: a.agentName,
    scopeType: a.scopeType,
    scopeId: a.scopeId,
    severity: a.severity,
    status: a.status,
    type: a.type,
    title: a.title,
    body: a.body,
    recommendedActions: a.recommendedActions,
    dedupeKey: a.dedupeKey,
    createdAt: a.createdAt.toISOString(),
    acknowledgedAt: a.acknowledgedAt ? a.acknowledgedAt.toISOString() : null,
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    resolutionSummary: a.resolutionSummary,
    ownerType: a.ownerType,
    ownerId: a.ownerId,
    ownerName: a.ownerName,
    relatedAgentRunId: a.relatedAgentRunId,
    relatedHandoffId: a.relatedHandoffId,
  };
}

export function registerAlertLifecycleRoutes(app: Express, jwtAuth: RequestHandler): void {
  const svc = new AlertLifecycleService(prisma as unknown as PrismaClient);

  // Pilot read surface: ORG-scoped alerts only (scopeType=ORG, scopeId=orgId).
  // This is intentionally narrow to avoid implying grant/worker alert browsing semantics.
  app.get('/api/org/autonomous-ops/alerts', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const take = parseTake(req.query.take);
      const status = parseAlertStatus(req.query.status);
      const agentName = typeof req.query.agentName === 'string' ? req.query.agentName : null;
      const since = parseIsoDate(req.query.since);
      const until = parseIsoDate(req.query.until);
      if (req.query.status !== undefined && !status) return res.status(400).json({ error: 'INVALID_STATUS' });
      if (req.query.since !== undefined && !since) return res.status(400).json({ error: 'INVALID_SINCE' });
      if (req.query.until !== undefined && !until) return res.status(400).json({ error: 'INVALID_UNTIL' });

      const items = await prisma.alert.findMany({
        where: {
          scopeType: 'ORG',
          scopeId: orgId,
          ...(status ? { status } : {}),
          ...(agentName ? { agentName } : {}),
          ...(since || until
            ? {
                createdAt: {
                  ...(since ? { gte: since } : {}),
                  ...(until ? { lte: until } : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          agentName: true,
          scopeType: true,
          scopeId: true,
          severity: true,
          status: true,
          type: true,
          title: true,
          body: true,
          recommendedActions: true,
          dedupeKey: true,
          createdAt: true,
          acknowledgedAt: true,
          resolvedAt: true,
          resolutionSummary: true,
          ownerType: true,
          ownerId: true,
          ownerName: true,
          relatedAgentRunId: true,
          relatedHandoffId: true,
        },
      });

      return res.json({
        orgId,
        scope: { type: 'ORG' as const, id: orgId },
        take,
        alerts: items.map(serializeAlert),
        disclaimers: [
          'Pilot read surface: returns ORG-scoped alerts only.',
          'Use /api/org/autonomous-ops/alerts/:id/audit for the append-only decision trail (status/owner/link).',
        ],
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/alerts/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const a = await prisma.alert.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          agentName: true,
          scopeType: true,
          scopeId: true,
          severity: true,
          status: true,
          type: true,
          title: true,
          body: true,
          recommendedActions: true,
          dedupeKey: true,
          createdAt: true,
          acknowledgedAt: true,
          resolvedAt: true,
          resolutionSummary: true,
          ownerType: true,
          ownerId: true,
          ownerName: true,
          relatedAgentRunId: true,
          relatedHandoffId: true,
        },
      });
      if (!a) return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
      if (a.scopeType !== 'ORG' || a.scopeId !== orgId) return res.status(403).json({ error: 'ALERT_FORBIDDEN' });
      return res.json({ alert: serializeAlert(a) });
    } catch (err) {
      return next(err);
    }
  });

  app.patch('/api/org/autonomous-ops/alerts/:id/status', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      const toStatus = parseAlertStatus(b.toStatus);
      if (!toStatus) return res.status(400).json({ error: 'INVALID_STATUS' });
      const actorType = b.actorType;
      if (actorType !== 'agent' && actorType !== 'user' && actorType !== 'system') {
        return res.status(400).json({ error: 'INVALID_ACTOR_TYPE' });
      }
      const resolutionSummary = typeof b.resolutionSummary === 'string' ? b.resolutionSummary : null;
      const detail =
        b.detail !== undefined && b.detail !== null && typeof b.detail === 'object' && !Array.isArray(b.detail)
          ? (b.detail as Record<string, unknown>)
          : null;

      const alert = await svc.transition(orgId, {
        alertId: req.params.id,
        toStatus,
        actorType,
        actorName: typeof b.actorName === 'string' ? b.actorName : null,
        resolutionSummary,
        detail,
      });
      return res.json({ alert });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ALERT_NOT_FOUND') return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ALERT_FORBIDDEN') return res.status(403).json({ error: 'ALERT_FORBIDDEN' });
      if (err instanceof Error && err.message === 'INVALID_TRANSITION') return res.status(409).json({ error: 'INVALID_TRANSITION' });
      if (err instanceof Error && err.message === 'RESOLUTION_REQUIRED') return res.status(400).json({ error: 'RESOLUTION_REQUIRED' });
      return next(err);
    }
  });

  app.patch('/api/org/autonomous-ops/alerts/:id/owner', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      const actorType = b.actorType;
      if (actorType !== 'agent' && actorType !== 'user' && actorType !== 'system') {
        return res.status(400).json({ error: 'INVALID_ACTOR_TYPE' });
      }

      if (b.ownerType === null) {
        const alert = await svc.setOwner(orgId, {
          alertId: req.params.id,
          ownerType: null,
          actorType,
          actorName: typeof b.actorName === 'string' ? b.actorName : null,
          detail:
            b.detail !== undefined && b.detail !== null && typeof b.detail === 'object' && !Array.isArray(b.detail)
              ? (b.detail as Record<string, unknown>)
              : null,
        });
        return res.json({ alert });
      }

      const ownerType = parseOwnerType(b.ownerType);
      if (!ownerType) return res.status(400).json({ error: 'INVALID_OWNER_TYPE' });
      if (typeof b.ownerName !== 'string') return res.status(400).json({ error: 'INVALID_OWNER_NAME' });

      const alert = await svc.setOwner(orgId, {
        alertId: req.params.id,
        ownerType,
        ownerId: typeof b.ownerId === 'string' ? b.ownerId : null,
        ownerName: b.ownerName,
        actorType,
        actorName: typeof b.actorName === 'string' ? b.actorName : null,
        detail:
          b.detail !== undefined && b.detail !== null && typeof b.detail === 'object' && !Array.isArray(b.detail)
            ? (b.detail as Record<string, unknown>)
            : null,
      });
      return res.json({ alert });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ALERT_NOT_FOUND') return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ALERT_FORBIDDEN') return res.status(403).json({ error: 'ALERT_FORBIDDEN' });
      if (err instanceof Error && err.message === 'OWNER_NAME_REQUIRED') return res.status(400).json({ error: 'OWNER_NAME_REQUIRED' });
      return next(err);
    }
  });

  app.post('/api/org/autonomous-ops/alerts/:id/link', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      const actorType = b.actorType;
      if (actorType !== 'agent' && actorType !== 'user' && actorType !== 'system') {
        return res.status(400).json({ error: 'INVALID_ACTOR_TYPE' });
      }

      const alert = await svc.link(orgId, {
        alertId: req.params.id,
        relatedAgentRunId: typeof b.relatedAgentRunId === 'string' ? b.relatedAgentRunId : undefined,
        relatedHandoffId: typeof b.relatedHandoffId === 'string' ? b.relatedHandoffId : undefined,
        actorType,
        actorName: typeof b.actorName === 'string' ? b.actorName : null,
        detail:
          b.detail !== undefined && b.detail !== null && typeof b.detail === 'object' && !Array.isArray(b.detail)
            ? (b.detail as Record<string, unknown>)
            : null,
      });
      return res.json({ alert });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ALERT_NOT_FOUND') return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ALERT_FORBIDDEN') return res.status(403).json({ error: 'ALERT_FORBIDDEN' });
      if (err instanceof Error && err.message === 'INVALID_RELATED_RUN') return res.status(400).json({ error: 'INVALID_RELATED_RUN' });
      if (err instanceof Error && err.message === 'INVALID_RELATED_HANDOFF') return res.status(400).json({ error: 'INVALID_RELATED_HANDOFF' });
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/alerts/:id/audit', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const entries = await svc.listAudit(orgId, req.params.id);
      return res.json({
        alertId: req.params.id,
        entries: entries.map((e: any) => ({
          id: e.id,
          createdAt: e.createdAt.toISOString(),
          action: e.action,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          actorType: e.actorType,
          actorName: e.actorName,
          detail: e.detail,
        })),
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ALERT_NOT_FOUND') return res.status(404).json({ error: 'ALERT_NOT_FOUND' });
      if (err instanceof Error && err.message === 'ALERT_FORBIDDEN') return res.status(403).json({ error: 'ALERT_FORBIDDEN' });
      return next(err);
    }
  });
}


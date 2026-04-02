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

export function registerAlertLifecycleRoutes(app: Express, jwtAuth: RequestHandler): void {
  const svc = new AlertLifecycleService(prisma as unknown as PrismaClient);

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


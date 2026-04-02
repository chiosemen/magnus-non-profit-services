import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { AgentHandoffStatus, PrismaClient } from '@magnus/db/types';
import { AgentHandoffService } from '@magnus/org-autonomous-ops-context';

const HANDOFF_STATUSES: AgentHandoffStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'];

function parseHandoffStatus(raw: string | undefined): AgentHandoffStatus | undefined {
  if (!raw) return undefined;
  return HANDOFF_STATUSES.includes(raw as AgentHandoffStatus) ? (raw as AgentHandoffStatus) : undefined;
}

function serializeHandoff(h: {
  id: string;
  orgId: string;
  fromAgentName: string;
  toAgentName: string;
  title: string;
  body: string;
  urgency: string;
  requiresHumanReview: boolean;
  status: AgentHandoffStatus;
  sourceEvidence: unknown;
  relatedAgentRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    id: h.id,
    orgId: h.orgId,
    fromAgentName: h.fromAgentName,
    toAgentName: h.toAgentName,
    title: h.title,
    body: h.body,
    urgency: h.urgency,
    requiresHumanReview: h.requiresHumanReview,
    status: h.status,
    sourceEvidence: h.sourceEvidence,
    relatedAgentRunId: h.relatedAgentRunId,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    resolvedAt: h.resolvedAt ? h.resolvedAt.toISOString() : null,
  };
}

export function registerAgentHandoffRoutes(app: Express, jwtAuth: RequestHandler): void {
  const svc = new AgentHandoffService(prisma as unknown as PrismaClient);

  app.post('/api/org/autonomous-ops/handoffs', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      if (
        typeof b.fromAgentName !== 'string' ||
        typeof b.toAgentName !== 'string' ||
        typeof b.title !== 'string' ||
        typeof b.body !== 'string'
      ) {
        return res.status(400).json({ error: 'INVALID_BODY' });
      }
      const handoff = await svc.create(orgId, {
        fromAgentName: b.fromAgentName,
        toAgentName: b.toAgentName,
        title: b.title,
        body: b.body,
        urgency: typeof b.urgency === 'string' ? b.urgency : undefined,
        requiresHumanReview: typeof b.requiresHumanReview === 'boolean' ? b.requiresHumanReview : undefined,
        sourceEvidence: b.sourceEvidence,
        relatedAgentRunId: typeof b.relatedAgentRunId === 'string' ? b.relatedAgentRunId : undefined,
      });
      return res.status(201).json({ handoff: serializeHandoff(handoff) });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
        if (err.message === 'TITLE_REQUIRED' || err.message === 'TITLE_TOO_LONG') {
          return res.status(400).json({ error: err.message });
        }
        if (err.message === 'BODY_TOO_LARGE') return res.status(413).json({ error: 'BODY_TOO_LARGE' });
        if (err.message === 'INVALID_SOURCE_EVIDENCE') return res.status(400).json({ error: 'INVALID_SOURCE_EVIDENCE' });
        if (err.message === 'INVALID_RELATED_RUN') return res.status(400).json({ error: 'INVALID_RELATED_RUN' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/handoffs', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const status = parseHandoffStatus(typeof req.query.status === 'string' ? req.query.status : undefined);
      const toAgentName = typeof req.query.toAgentName === 'string' ? req.query.toAgentName : undefined;
      const items = await svc.list(orgId, { status, toAgentName });
      return res.json({ orgId, handoffs: items.map(serializeHandoff) });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') {
        return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/handoffs/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const handoff = await svc.get(orgId, req.params.id);
      return res.json({ handoff: serializeHandoff(handoff) });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'HANDOFF_NOT_FOUND') {
        return res.status(404).json({ error: 'HANDOFF_NOT_FOUND' });
      }
      return next(err);
    }
  });

  app.patch('/api/org/autonomous-ops/handoffs/:id/status', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      const toStatus = parseHandoffStatus(typeof b.toStatus === 'string' ? b.toStatus : undefined);
      if (!toStatus) return res.status(400).json({ error: 'INVALID_STATUS' });
      const actorType = b.actorType;
      if (actorType !== 'agent' && actorType !== 'user' && actorType !== 'system') {
        return res.status(400).json({ error: 'INVALID_ACTOR_TYPE' });
      }
      const handoff = await svc.transition(orgId, {
        handoffId: req.params.id,
        toStatus,
        actorType,
        actorName: typeof b.actorName === 'string' ? b.actorName : null,
        detail: b.detail !== undefined && b.detail !== null && typeof b.detail === 'object' && !Array.isArray(b.detail)
          ? (b.detail as Record<string, unknown>)
          : null,
      });
      return res.json({ handoff: serializeHandoff(handoff) });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'HANDOFF_NOT_FOUND') {
        return res.status(404).json({ error: 'HANDOFF_NOT_FOUND' });
      }
      if (err instanceof Error && err.message === 'INVALID_TRANSITION') {
        return res.status(409).json({ error: 'INVALID_TRANSITION' });
      }
      if (err instanceof Error && err.message === 'RESOLUTION_REQUIRED') {
        return res.status(400).json({ error: 'RESOLUTION_REQUIRED' });
      }
      if (err instanceof Error && err.message === 'CANCELLATION_REASON_REQUIRED') {
        return res.status(400).json({ error: 'CANCELLATION_REASON_REQUIRED' });
      }
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/handoffs/:id/audit', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const entries = await svc.listAudit(orgId, req.params.id);
      return res.json({
        handoffId: req.params.id,
        entries: entries.map(e => ({
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
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      if (err instanceof Error && err.message === 'HANDOFF_NOT_FOUND') {
        return res.status(404).json({ error: 'HANDOFF_NOT_FOUND' });
      }
      return next(err);
    }
  });
}

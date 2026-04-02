import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { AgentRunStatus, AgentScopeType, AlertSeverity, AlertStatus, PrismaClient } from '@magnus/db/types';
import { buildPortfolioAccountabilitySnapshot } from '@magnus/org-autonomous-ops-context';

const SCOPE_TYPES: AgentScopeType[] = ['ORG', 'WORKER', 'GRANT'];
const RUN_STATUSES: AgentRunStatus[] = ['STARTED', 'SUCCESS', 'FAILED'];
const ALERT_SEVERITIES: AlertSeverity[] = ['LOW', 'MED', 'HIGH', 'CRITICAL'];
const ALERT_STATUSES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];

function parseScopeType(raw: unknown): AgentScopeType | null {
  if (typeof raw !== 'string') return null;
  return SCOPE_TYPES.includes(raw as AgentScopeType) ? (raw as AgentScopeType) : null;
}

function parseRunStatus(raw: unknown): AgentRunStatus | null {
  if (typeof raw !== 'string') return null;
  return RUN_STATUSES.includes(raw as AgentRunStatus) ? (raw as AgentRunStatus) : null;
}

function parseSeverity(raw: unknown): AlertSeverity | null {
  if (typeof raw !== 'string') return null;
  return ALERT_SEVERITIES.includes(raw as AlertSeverity) ? (raw as AlertSeverity) : null;
}

function parseAlertStatus(raw: unknown): AlertStatus | null {
  if (typeof raw !== 'string') return null;
  return ALERT_STATUSES.includes(raw as AlertStatus) ? (raw as AlertStatus) : null;
}

function parseTake(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, 200);
}

async function assertScopeAuthorized(orgId: string, scopeType: AgentScopeType, scopeId: string): Promise<void> {
  if (scopeType === 'ORG') {
    if (scopeId !== orgId) throw new Error('SCOPE_FORBIDDEN');
    return;
  }
  if (scopeType === 'GRANT') {
    const g = await prisma.grant.findUnique({ where: { id: scopeId }, select: { orgId: true } });
    if (!g || g.orgId !== orgId) throw new Error('SCOPE_FORBIDDEN');
    return;
  }
  if (scopeType === 'WORKER') {
    const rel = await prisma.workerOrgRelationship.findFirst({
      where: { workerId: scopeId, orgId },
      select: { id: true },
    });
    if (!rel) throw new Error('SCOPE_FORBIDDEN');
    return;
  }
  throw new Error('INVALID_SCOPE_TYPE');
}

function serializeRun(r: {
  id: string;
  agentName: string;
  scopeType: AgentScopeType;
  scopeId: string;
  windowStart: Date;
  windowEnd: Date;
  status: AgentRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  autonomyTier: string;
  requiresHumanReview: boolean;
  sourceRefs: unknown;
  metrics: unknown;
}) {
  return {
    id: r.id,
    agentName: r.agentName,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    windowStart: r.windowStart.toISOString(),
    windowEnd: r.windowEnd.toISOString(),
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    error: r.error,
    autonomyTier: r.autonomyTier,
    requiresHumanReview: r.requiresHumanReview,
    sourceRefs: r.sourceRefs,
    metrics: r.metrics,
  };
}

function serializeAlert(a: {
  id: string;
  agentName: string;
  scopeType: AgentScopeType;
  scopeId: string;
  severity: AlertSeverity;
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
  ownerType: string | null;
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

export function registerControlTowerRoutes(app: Express, jwtAuth: RequestHandler): void {
  app.get('/api/org/autonomous-ops/control-tower/runs', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;

      const scopeType = parseScopeType(req.query.scopeType) ?? 'ORG';
      const scopeId = typeof req.query.scopeId === 'string' ? req.query.scopeId : orgId;
      const status = req.query.status !== undefined ? parseRunStatus(req.query.status) : null;
      if (req.query.status !== undefined && !status) return res.status(400).json({ error: 'INVALID_STATUS' });

      const take = parseTake(req.query.take) ?? 50;
      const agentName = typeof req.query.agentName === 'string' ? req.query.agentName : undefined;

      await assertScopeAuthorized(orgId, scopeType, scopeId);

      const runs = await prisma.agentRun.findMany({
        where: {
          scopeType,
          scopeId,
          ...(status ? { status } : {}),
          ...(agentName ? { agentName } : {}),
        },
        orderBy: [{ windowEnd: 'desc' }],
        take,
      });

      return res.json({ orgId, scopeType, scopeId, runs: runs.map(serializeRun) });
    } catch (err) {
      if (err instanceof Error && err.message === 'SCOPE_FORBIDDEN') return res.status(403).json({ error: 'SCOPE_FORBIDDEN' });
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/control-tower/alerts', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;

      const scopeType = parseScopeType(req.query.scopeType) ?? 'ORG';
      const scopeId = typeof req.query.scopeId === 'string' ? req.query.scopeId : orgId;
      const severity = req.query.severity !== undefined ? parseSeverity(req.query.severity) : null;
      if (req.query.severity !== undefined && !severity) return res.status(400).json({ error: 'INVALID_SEVERITY' });
      const status = req.query.status !== undefined ? parseAlertStatus(req.query.status) : null;
      if (req.query.status !== undefined && !status) return res.status(400).json({ error: 'INVALID_STATUS' });

      const take = parseTake(req.query.take) ?? 50;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const acknowledged =
        req.query.acknowledged === undefined ? undefined : req.query.acknowledged === 'true' ? true : req.query.acknowledged === 'false' ? false : null;
      if (acknowledged === null) return res.status(400).json({ error: 'INVALID_ACKNOWLEDGED' });

      await assertScopeAuthorized(orgId, scopeType, scopeId);

      const alerts = await prisma.alert.findMany({
        where: {
          scopeType,
          scopeId,
          ...(severity ? { severity } : {}),
          ...(status ? { status } : {}),
          ...(type ? { type } : {}),
          ...(acknowledged === undefined ? {} : acknowledged ? { acknowledgedAt: { not: null } } : { acknowledgedAt: null }),
        },
        orderBy: [{ createdAt: 'desc' }],
        take,
      });

      return res.json({ orgId, scopeType, scopeId, alerts: alerts.map(serializeAlert) });
    } catch (err) {
      if (err instanceof Error && err.message === 'SCOPE_FORBIDDEN') return res.status(403).json({ error: 'SCOPE_FORBIDDEN' });
      return next(err);
    }
  });

  app.get('/api/org/autonomous-ops/control-tower/summary', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const take = parseTake(req.query.take) ?? 25;

      const dueSoonDaysRaw = req.query.dueSoonDays;
      const dueSoonDaysParsed =
        dueSoonDaysRaw === undefined ? undefined : parseInt(String(dueSoonDaysRaw), 10);
      const dueSoonDays =
        dueSoonDaysParsed !== undefined &&
        Number.isFinite(dueSoonDaysParsed) &&
        dueSoonDaysParsed > 0 &&
        dueSoonDaysParsed <= 180
          ? dueSoonDaysParsed
          : undefined;

      const now = new Date();
      const [runs, alerts, openHandoffs, accountability] = await Promise.all([
        prisma.agentRun.findMany({
          where: { scopeType: 'ORG', scopeId: orgId },
          orderBy: [{ windowEnd: 'desc' }],
          take,
        }),
        prisma.alert.findMany({
          where: { scopeType: 'ORG', scopeId: orgId, status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } },
          orderBy: [{ createdAt: 'desc' }],
          take,
        }),
        prisma.agentHandoff.findMany({
          where: { orgId, status: 'OPEN' },
          orderBy: [{ createdAt: 'desc' }],
          take,
        }),
        buildPortfolioAccountabilitySnapshot({
          db: prisma as unknown as PrismaClient,
          orgId,
          now,
          dueSoonDays,
        }),
      ]);

      return res.json({
        orgId,
        scopeType: 'ORG' as const,
        scopeId: orgId,
        runs: runs.map(serializeRun),
        alerts: alerts.map(serializeAlert),
        handoffs: openHandoffs.map(h => ({
          id: h.id,
          fromAgentName: h.fromAgentName,
          toAgentName: h.toAgentName,
          title: h.title,
          urgency: h.urgency,
          requiresHumanReview: h.requiresHumanReview,
          status: h.status,
          relatedAgentRunId: h.relatedAgentRunId,
          createdAt: h.createdAt.toISOString(),
          updatedAt: h.updatedAt.toISOString(),
        })),
        accountability,
        disclaimers: [
          'Control tower lists are capped by take; accountability rollups are full counts for the org scope (not capped).',
          'Rollups are not a task system and imply no composite score; drill down via control-tower list routes and lifecycle APIs.',
        ],
      });
    } catch (err) {
      return next(err);
    }
  });
}


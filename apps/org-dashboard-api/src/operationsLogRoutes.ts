import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  buildOperationsLog,
  type OperationsLogRowType,
} from '@magnus/org-autonomous-ops-context';

function parseTake(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, 200);
}

function parseIsoDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function parseCommaList(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function isRowType(x: string): x is OperationsLogRowType {
  return (
    x === 'ALERT_CREATED' ||
    x === 'ALERT_STATUS_CHANGED' ||
    x === 'ALERT_OWNER_CHANGED' ||
    x === 'ALERT_LINKED' ||
    x === 'HANDOFF_CREATED' ||
    x === 'HANDOFF_STATUS_CHANGED' ||
    x === 'AGENT_RUN_STARTED' ||
    x === 'AGENT_RUN_SUCCESS' ||
    x === 'AGENT_RUN_FAILED' ||
    x === 'AUTONOMY_BLOCKED_INTERNAL_EFFECT' ||
    x === 'OBLIGATION_SURFACED_SNAPSHOT'
  );
}

export function registerOperationsLogRoutes(app: Express, jwtAuth: RequestHandler): void {
  app.get('/api/org/autonomous-ops/operations-log', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const take = parseTake(req.query.take);
      const since = parseIsoDate(req.query.since);
      const until = parseIsoDate(req.query.until);
      if (req.query.since !== undefined && !since) return res.status(400).json({ error: 'INVALID_SINCE' });
      if (req.query.until !== undefined && !until) return res.status(400).json({ error: 'INVALID_UNTIL' });

      const agentNames = parseCommaList(req.query.agentName);
      const typesRaw = parseCommaList(req.query.type);
      const types = typesRaw ? typesRaw.filter(isRowType) : null;
      if (typesRaw && (!types || types.length !== typesRaw.length)) {
        return res.status(400).json({ error: 'INVALID_TYPE' });
      }

      const payload = await buildOperationsLog({
        db: prisma as unknown as PrismaClient,
        orgId,
        take,
        since,
        until,
        agentNames,
        types,
        includeObligationSnapshot: req.query.includeObligations === 'false' ? false : true,
        now: new Date(),
      });

      return res.json(payload);
    } catch (err) {
      return next(err);
    }
  });
}


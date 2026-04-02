import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  appendVolunteerEvent,
  listVolunteerEvents,
  VOLUNTEER_EVENT_DUPLICATE,
} from '@magnus/org-autonomous-ops-context';

function parseIsoDate(raw: unknown, field: string): Date {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`invalid_${field}`);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid_${field}`);
  return d;
}

export function registerVolunteerEventRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  app.get('/api/org/volunteer-events', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const q = req.query as Record<string, string | undefined>;
      let start: Date | undefined;
      let end: Date | undefined;
      if (q.start) {
        try {
          start = parseIsoDate(q.start, 'start');
        } catch {
          return res.status(400).json({ error: 'INVALID_START' });
        }
      }
      if (q.end) {
        try {
          end = parseIsoDate(q.end, 'end');
        } catch {
          return res.status(400).json({ error: 'INVALID_END' });
        }
      }
      const takeRaw = q.take ? parseInt(String(q.take), 10) : 100;
      const take = Number.isFinite(takeRaw) ? Math.min(500, Math.max(1, takeRaw)) : 100;

      const events = await listVolunteerEvents(db, orgId, { start, end, take });
      return res.json({ orgId, volunteerEvents: events });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/org/volunteer-events', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const body = req.body as Record<string, unknown>;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'INVALID_BODY' });
      }

      let occurredAt: Date;
      try {
        occurredAt = parseIsoDate(body['occurredAt'], 'occurredAt');
      } catch {
        return res.status(400).json({ error: 'INVALID_OCCURRED_AT' });
      }

      const hours = body['hours'];
      if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: 'INVALID_HOURS' });
      }

      const sourceSystem = body['sourceSystem'];
      const sourceRef = body['sourceRef'];
      if (typeof sourceSystem !== 'string' || !sourceSystem.trim()) {
        return res.status(400).json({ error: 'INVALID_SOURCE_SYSTEM' });
      }
      if (typeof sourceRef !== 'string' || !sourceRef.trim()) {
        return res.status(400).json({ error: 'INVALID_SOURCE_REF' });
      }

      const activityLabel = body['activityLabel'];
      if (
        activityLabel !== undefined &&
        activityLabel !== null &&
        typeof activityLabel !== 'string'
      ) {
        return res.status(400).json({ error: 'INVALID_ACTIVITY_LABEL' });
      }

      const raw = body['raw'];
      if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
        return res.status(400).json({ error: 'INVALID_RAW' });
      }

      try {
        const created = await appendVolunteerEvent(db, orgId, {
          occurredAt,
          hours,
          activityLabel: typeof activityLabel === 'string' ? activityLabel : undefined,
          sourceSystem,
          sourceRef,
          raw: raw === undefined || raw === null ? undefined : (raw as object),
        });
        return res.status(201).json({ volunteerEvent: created });
      } catch (err) {
        if (err instanceof Error && err.message === VOLUNTEER_EVENT_DUPLICATE) {
          return res.status(409).json({ error: 'VOLUNTEER_EVENT_DUPLICATE' });
        }
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  });
}

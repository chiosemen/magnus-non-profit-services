import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  appendDonorEvent,
  DONOR_EVENT_DUPLICATE,
  listDonorEvents,
} from '@magnus/org-autonomous-ops-context';

function parseIsoDate(raw: unknown, field: string): Date {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error(`invalid_${field}`);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid_${field}`);
  return d;
}

export function registerDonorEventRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  app.get('/api/org/donor-events', jwtAuth, async (req, res, next) => {
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

      const events = await listDonorEvents(db, orgId, { start, end, take });
      return res.json({ orgId, donorEvents: events });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/org/donor-events', jwtAuth, async (req, res, next) => {
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

      const amount = body['amount'];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'INVALID_AMOUNT' });
      }

      const sourceSystem = body['sourceSystem'];
      const sourceRef = body['sourceRef'];
      if (typeof sourceSystem !== 'string' || !sourceSystem.trim()) {
        return res.status(400).json({ error: 'INVALID_SOURCE_SYSTEM' });
      }
      if (typeof sourceRef !== 'string' || !sourceRef.trim()) {
        return res.status(400).json({ error: 'INVALID_SOURCE_REF' });
      }

      const currency = body['currency'];
      if (currency !== undefined && currency !== null && typeof currency !== 'string') {
        return res.status(400).json({ error: 'INVALID_CURRENCY' });
      }

      const raw = body['raw'];
      if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
        return res.status(400).json({ error: 'INVALID_RAW' });
      }

      try {
        const created = await appendDonorEvent(db, orgId, {
          occurredAt,
          amount,
          currency: typeof currency === 'string' ? currency : undefined,
          sourceSystem,
          sourceRef,
          raw: raw === undefined || raw === null ? undefined : (raw as object),
        });
        return res.status(201).json({ donorEvent: created });
      } catch (err) {
        if (err instanceof Error && err.message === DONOR_EVENT_DUPLICATE) {
          return res.status(409).json({ error: 'DONOR_EVENT_DUPLICATE' });
        }
        throw err;
      }
    } catch (err) {
      return next(err);
    }
  });
}

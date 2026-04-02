import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import { buildActiveObligations } from '@magnus/org-autonomous-ops-context';

function parseTake(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(n, 200);
}

export function registerObligationRoutes(app: Express, jwtAuth: RequestHandler): void {
  app.get('/api/org/autonomous-ops/obligations/active', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const take = parseTake(req.query.take) ?? 50;
      const dueSoonDaysRaw = req.query.dueSoonDays;
      const dueSoonDaysParsed = dueSoonDaysRaw === undefined ? undefined : parseInt(String(dueSoonDaysRaw), 10);
      const dueSoonDays =
        dueSoonDaysParsed !== undefined && Number.isFinite(dueSoonDaysParsed) && dueSoonDaysParsed > 0 && dueSoonDaysParsed <= 180
          ? dueSoonDaysParsed
          : undefined;

      const activeObligations = await buildActiveObligations({
        db: prisma as unknown as PrismaClient,
        orgId,
        take,
        now: new Date(),
        dueSoonDays,
      });

      return res.json({
        orgId,
        asOfIso: new Date().toISOString(),
        activeObligations,
        disclaimers: [
          'Derived view only: obligations are built from existing Alerts, Handoffs, and ComplianceCalendar rows.',
          'No generic task platform is implied; resolve items via lifecycle endpoints and audit trails.',
        ],
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'UNKNOWN_ALERT_SEVERITY') {
        return res.status(500).json({ error: 'UNKNOWN_ALERT_SEVERITY' });
      }
      return next(err);
    }
  });
}


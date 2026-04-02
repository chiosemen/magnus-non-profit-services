import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import { buildExecutiveBoard } from '@magnus/org-autonomous-ops-context';

export function registerExecutiveRollupRoutes(app: Express, jwtAuth: RequestHandler): void {
  app.get('/api/org/autonomous-ops/executive/board', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const take = req.query.take ? Math.min(200, Math.max(1, parseInt(String(req.query.take), 10))) : 50;
      const board = await buildExecutiveBoard({ db: prisma as any, orgId, take, now: new Date() });
      return res.json(board);
    } catch (err) {
      if (err instanceof Error && err.message === 'UNKNOWN_ALERT_SEVERITY') {
        return res.status(500).json({ error: 'UNKNOWN_ALERT_SEVERITY' });
      }
      return next(err);
    }
  });
}


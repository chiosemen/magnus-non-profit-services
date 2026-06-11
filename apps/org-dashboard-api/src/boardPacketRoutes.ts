import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import { buildBoardPacket } from '@magnus/org-autonomous-ops-context';
import { ORG_DASHBOARD_ROUTE_FEATURES } from '@magnus/subscription';
import { createSubscriptionGate } from './subscriptionGate';

export function registerBoardPacketRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;
  const featureGate = createSubscriptionGate(ORG_DASHBOARD_ROUTE_FEATURES.boardAndExecutivePackets, {
    db,
    routeName: 'board-packet',
  });

  app.get('/api/org/executive/board-packet', jwtAuth, featureGate, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const includeAiNarrative = req.query.includeAiNarrative === 'true';

      const result = await buildBoardPacket(db, orgId, { includeAiNarrative });
      return res.json({ boardPacket: result });
    } catch (err) {
      if (err instanceof Error && err.message === 'Organization context is missing.') {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  });
}

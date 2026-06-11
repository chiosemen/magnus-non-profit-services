import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import { buildExecutivePacket } from '@magnus/org-autonomous-ops-context';

export function registerExecutivePacketRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  app.get('/api/org/executive/packet', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await buildExecutivePacket(db, orgId);
      return res.json({ packet: result });
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  });
}

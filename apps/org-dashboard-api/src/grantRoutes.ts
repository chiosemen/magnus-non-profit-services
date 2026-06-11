import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import { createGrant, listGrants, getGrant } from '@magnus/org-autonomous-ops-context';

export function registerGrantRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  const handleError = (err: any, res: any, next: any) => {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'NotFoundError') {
      return res.status(404).json({ error: err.message });
    }
    return next(err);
  };

  app.post('/api/org/grants', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { funderName, totalAmount, startDate, endDate, spentToDate, reportingSchedule } = req.body || {};
      const result = await createGrant(db, orgId, {
        funderName,
        totalAmount,
        startDate,
        endDate,
        spentToDate,
        reportingSchedule,
      });
      return res.status(201).json({ grant: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/grants', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await listGrants(db, orgId);
      return res.json({ orgId, grants: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/grants/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const grantId = req.params.id;
      const result = await getGrant(db, orgId, grantId);
      return res.json({ grant: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });
}

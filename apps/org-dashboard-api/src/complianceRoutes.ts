import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  createComplianceDeadline,
  updateComplianceStatus,
  listComplianceCalendar,
} from '@magnus/org-autonomous-ops-context';

export function registerComplianceRoutes(app: Express, jwtAuth: RequestHandler): void {
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

  app.post('/api/org/compliance', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { deadlineType, dueDate, status, asanaTaskId } = req.body || {};
      const result = await createComplianceDeadline(db, orgId, {
        deadlineType,
        dueDate,
        status,
        asanaTaskId,
      });
      return res.status(201).json({ compliance: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.put('/api/org/compliance/:id/status', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const complianceId = req.params.id;
      const { status } = req.body || {};
      const result = await updateComplianceStatus(db, orgId, complianceId, status);
      return res.json({ compliance: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/compliance', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await listComplianceCalendar(db, orgId);
      return res.json({ orgId, complianceCalendar: result, compliance: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });
}

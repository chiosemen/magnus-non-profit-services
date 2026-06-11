import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  createVolunteer,
  listVolunteers,
  logVolunteerHours,
  createEvent,
  listEvents,
  registerAttendee,
  createSponsorshipTier,
} from '@magnus/org-autonomous-ops-context';

export function registerVolunteerRoutes(app: Express, jwtAuth: RequestHandler): void {
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

  app.post('/api/org/volunteers', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { name, email, phone, donorId } = req.body || {};
      const result = await createVolunteer(db, orgId, { name, email, phone, donorId });
      return res.status(201).json({ volunteer: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/volunteers', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await listVolunteers(db, orgId);
      return res.json({ volunteers: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/volunteers/hours', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { volunteerId, eventId, hours, date, activityLabel } = req.body || {};
      const result = await logVolunteerHours(db, orgId, {
        volunteerId,
        eventId,
        hours: Number(hours),
        date,
        activityLabel,
      });
      return res.status(201).json({ log: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/events', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { name, description, startDate, endDate, campaignId } = req.body || {};
      const result = await createEvent(db, orgId, { name, description, startDate, endDate, campaignId });
      return res.status(201).json({ event: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/events', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await listEvents(db, orgId);
      return res.json({ events: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/events/registrations', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { eventId, volunteerId, status } = req.body || {};
      const result = await registerAttendee(db, orgId, { eventId, volunteerId, status });
      return res.status(201).json({ registration: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/campaigns/sponsorships', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { campaignId, name, amount, description } = req.body || {};
      const result = await createSponsorshipTier(db, orgId, { campaignId, name, amount, description });
      return res.status(201).json({ sponsorshipTier: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });
}

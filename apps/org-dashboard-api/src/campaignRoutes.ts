import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import { ORG_DASHBOARD_ROUTE_FEATURES } from '@magnus/subscription';
import { createSubscriptionGate } from './subscriptionGate';
import {
  archiveCampaign,
  createCampaign,
  getCampaignById,
  listCampaigns,
  publishCampaign,
  updateCampaign,
} from '@magnus/org-autonomous-ops-context';

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) throw new Error('CAMPAIGN_DATE_INVALID');
  return dt;
}

function getOrgId(req: any): string | null {
  return (req?.auth?.orgId as string | undefined) ?? null;
}

export function registerCampaignRoutes(
  app: Express,
  jwtAuth: RequestHandler,
  options?: { db?: PrismaClient },
): void {
  const db = options?.db ?? (prisma as unknown as PrismaClient);
  const featureGate = createSubscriptionGate(ORG_DASHBOARD_ROUTE_FEATURES.campaignAdmin, {
    db,
    routeName: 'campaign-admin',
  });

  app.get('/api/org/campaigns', jwtAuth, featureGate, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });

      const campaigns = await listCampaigns(db, orgId);
      return res.json({ campaigns });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/org/campaigns', jwtAuth, featureGate, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });

      const body = req.body || {};
      if (!body.title || !String(body.title).trim()) {
        return res.status(400).json({ error: 'CAMPAIGN_TITLE_REQUIRED' });
      }

      const campaign = await createCampaign(db, orgId, {
        title: String(body.title),
        slug: body.slug ? String(body.slug) : undefined,
        description: body.description !== undefined ? String(body.description) : undefined,
        goalAmount: body.goalAmount,
        currency: body.currency ? String(body.currency) : undefined,
        startsAt: parseOptionalDate(body.startsAt),
        endsAt: parseOptionalDate(body.endsAt),
      });

      return res.status(201).json({ campaign });
    } catch (err: any) {
      if (err?.message === 'CAMPAIGN_DATE_INVALID' || err?.message === 'CAMPAIGN_GOAL_AMOUNT_INVALID' || err?.message === 'CAMPAIGN_DATE_RANGE_INVALID') {
        return res.status(400).json({ error: err.message });
      }
      if (err?.message === 'CAMPAIGN_SLUG_DUPLICATE') {
        return res.status(409).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.get('/api/org/campaigns/:id', jwtAuth, featureGate, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });

      const campaign = await getCampaignById(db, orgId, req.params.id);
      return res.json({ campaign });
    } catch (err: any) {
      if (err?.message === 'CAMPAIGN_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.patch('/api/org/campaigns/:id', jwtAuth, featureGate, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });

      const body = req.body || {};
      const campaign = await updateCampaign(db, orgId, req.params.id, {
        title: body.title !== undefined ? String(body.title) : undefined,
        slug: body.slug !== undefined ? String(body.slug) : undefined,
        description: body.description !== undefined ? String(body.description) : undefined,
        goalAmount: body.goalAmount,
        currency: body.currency !== undefined ? String(body.currency) : undefined,
        startsAt: parseOptionalDate(body.startsAt),
        endsAt: parseOptionalDate(body.endsAt),
      });

      return res.json({ campaign });
    } catch (err: any) {
      if (err?.message === 'CAMPAIGN_NOT_FOUND') return res.status(404).json({ error: err.message });
      if (
        err?.message === 'CAMPAIGN_DATE_INVALID' ||
        err?.message === 'CAMPAIGN_GOAL_AMOUNT_INVALID' ||
        err?.message === 'CAMPAIGN_DATE_RANGE_INVALID' ||
        err?.message === 'CAMPAIGN_TITLE_REQUIRED' ||
        err?.message === 'CAMPAIGN_SLUG_REQUIRED' ||
        err?.message === 'CAMPAIGN_CURRENCY_INVALID'
      ) {
        return res.status(400).json({ error: err.message });
      }
      if (err?.message === 'CAMPAIGN_SLUG_DUPLICATE') return res.status(409).json({ error: err.message });
      return next(err);
    }
  });

  app.post('/api/org/campaigns/:id/publish', jwtAuth, featureGate, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });

      const campaign = await publishCampaign(db, orgId, req.params.id);
      return res.json({ campaign });
    } catch (err: any) {
      if (err?.message === 'CAMPAIGN_NOT_FOUND') return res.status(404).json({ error: err.message });
      if (err?.message === 'STRIPE_CONNECT_NOT_ENABLED' || err?.message === 'CAMPAIGN_ARCHIVED_NOT_PUBLISHABLE') {
        return res.status(409).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.post('/api/org/campaigns/:id/archive', jwtAuth, featureGate, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });

      const campaign = await archiveCampaign(db, orgId, req.params.id);
      return res.json({ campaign });
    } catch (err: any) {
      if (err?.message === 'CAMPAIGN_NOT_FOUND') return res.status(404).json({ error: err.message });
      return next(err);
    }
  });
}

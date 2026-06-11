import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  listCampaigns,
  getCampaignDetail,
  createCampaign,
  updateCampaign,
  publishCampaign,
  unpublishCampaign,
  createStripeOnboardingLink,
  getStripeAccountStatus,
} from '@magnus/org-autonomous-ops-context';

export function registerStripeCampaignRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  // Helper to handle service errors uniformly
  const handleError = (err: any, res: any, next: any) => {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'NotFoundError') {
      return res.status(404).json({ error: err.message });
    }
    if (err.name === 'ForbiddenError') {
      return res.status(403).json({ error: err.message });
    }
    return next(err);
  };

  // ─── Stripe Connect Onboarding Routes ──────────────────────────────────────

  app.post('/api/org/stripe-connect/onboard', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { returnUrl, refreshUrl } = req.body || {};
      const result = await createStripeOnboardingLink(db, orgId, returnUrl, refreshUrl);
      return res.json(result);
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/stripe-connect/status', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const status = await getStripeAccountStatus(db, orgId);
      return res.json({ stripeConnectAccount: status });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/stripe-connect/refresh', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { returnUrl, refreshUrl } = req.query as Record<string, string | undefined>;
      const result = await createStripeOnboardingLink(db, orgId, returnUrl || '', refreshUrl || '');
      return res.json(result);
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Campaign Administration Routes ────────────────────────────────────────

  app.get('/api/org/campaigns', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const campaigns = await listCampaigns(db, orgId);
      return res.json({ orgId, campaigns });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/campaigns', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { name, slug, description, goalAmount, currency } = req.body || {};
      const campaign = await createCampaign(db, orgId, {
        name,
        slug,
        description,
        goalAmount,
        currency,
      });
      return res.status(201).json({ campaign });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/campaigns/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const campaignId = req.params.id;
      const campaign = await getCampaignDetail(db, orgId, campaignId);
      return res.json({ campaign });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.patch('/api/org/campaigns/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const campaignId = req.params.id;
      const { name, slug, description, goalAmount, currency } = req.body || {};
      const campaign = await updateCampaign(db, orgId, campaignId, {
        name,
        slug,
        description,
        goalAmount,
        currency,
      });
      return res.json({ campaign });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/campaigns/:id/publish', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const campaignId = req.params.id;
      const campaign = await publishCampaign(db, orgId, campaignId);
      return res.json({ campaign });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/campaigns/:id/unpublish', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const campaignId = req.params.id;
      const campaign = await unpublishCampaign(db, orgId, campaignId);
      return res.json({ campaign });
    } catch (err) {
      return handleError(err, res, next);
    }
  });
}

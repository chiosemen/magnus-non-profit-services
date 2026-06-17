import type { Express } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  getPublicCampaign,
  createDonationCheckoutSession,
  verifyStripeSignature,
  processWebhookEvent,
} from '@magnus/org-autonomous-ops-context';
import { createOrgDashboardRateLimitMiddleware } from './rateLimit';

export function registerPublicDonationRoutes(app: Express): void {
  const db = prisma as unknown as PrismaClient;
  const rateLimitWrites = createOrgDashboardRateLimitMiddleware();

  // ─── Campaign Public Details ───────────────────────────────────────────────

  app.get('/api/public/campaigns/:slug', async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { campaign, organizationName } = await getPublicCampaign(db, slug);
      return res.json({
        campaign: {
          id: campaign.id,
          title: campaign.title,
          slug: campaign.slug,
          description: campaign.description,
          goalAmount: campaign.goalAmount,
          currency: campaign.currency,
          status: campaign.status,
        },
        organizationName,
      });
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return res.status(404).json({ error: err.message });
      }
      if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  });

  // ─── Create Checkout Redirect Link ──────────────────────────────────────────

  app.post('/api/public/campaigns/:slug/checkout', rateLimitWrites, async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { amount, donorEmail, donorName, coverFees, successUrl, cancelUrl } = req.body || {};

      const result = await createDonationCheckoutSession(db, slug, {
        amount,
        donorEmail,
        donorName,
        coverFees: !!coverFees,
        successUrl,
        cancelUrl,
      });

      return res.status(201).json(result);
    } catch (err: any) {
      if (err.name === 'NotFoundError') {
        return res.status(404).json({ error: err.message });
      }
      if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  });

  // ─── Webhook Listener ──────────────────────────────────────────────────────

  app.post('/api/public/stripe/webhook', rateLimitWrites, async (req, res, next) => {
    try {
      const signatureHeader = req.headers['stripe-signature'] as string;
      const rawBody = (req as any).rawBody || '';
      const secret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!secret) {
        // Fail-closed if webhook secret is missing
        return res.status(500).json({ error: 'Webhook secret is not configured.' });
      }

      const isValid = verifyStripeSignature(rawBody, signatureHeader || '', secret);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid Stripe signature verification.' });
      }

      const event = req.body;
      await processWebhookEvent(db, event);

      return res.json({ received: true });
    } catch (err: any) {
      if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  });
}

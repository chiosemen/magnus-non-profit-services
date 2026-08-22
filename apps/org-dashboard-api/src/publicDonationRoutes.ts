import type { Express } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  getPublicCampaign,
  createDonationCheckoutSession,
  PAYMENT_PILOT_DISABLED_MESSAGE,
  verifyStripeSignature,
  processWebhookEvent,
} from '@magnus/org-autonomous-ops-context';
import { createOrgDashboardRateLimitMiddleware } from './rateLimit';
import type { RequestHandler } from 'express';

type PublicDonationRouteDeps = {
  db?: PrismaClient;
  getPublicCampaign?: (
    db: PrismaClient,
    slug: string,
  ) => Promise<{ campaign: Record<string, unknown>; organizationName: string }>;
  createDonationCheckoutSession?: (
    db: PrismaClient,
    slug: string,
    data: {
      amount: number;
      donorEmail: string;
      donorName: string;
      coverFees: boolean;
      successUrl: string;
      cancelUrl: string;
    },
  ) => Promise<{ url: string; stripeCheckoutSessionId: string }>;
  paymentsEnabled?: () => boolean;
  rateLimitWrites?: RequestHandler;
};

function arePaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED?.trim().toLowerCase() !== 'false';
}

export function registerPublicDonationRoutes(app: Express, deps: PublicDonationRouteDeps = {}): void {
  const db = deps.db ?? (prisma as unknown as PrismaClient);
  const getPublicCampaignFn = deps.getPublicCampaign ?? getPublicCampaign;
  const createDonationCheckoutSessionFn = deps.createDonationCheckoutSession ?? createDonationCheckoutSession;
  const paymentsEnabled = deps.paymentsEnabled ?? arePaymentsEnabled;
  const rateLimitWrites = deps.rateLimitWrites ?? createOrgDashboardRateLimitMiddleware();

  // ─── Campaign Public Details ───────────────────────────────────────────────

  app.get('/api/public/campaigns/:slug', async (req, res, next) => {
    try {
      const { slug } = req.params;
      const { campaign, organizationName } = await getPublicCampaignFn(db, slug);
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
        paymentsEnabled: paymentsEnabled(),
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
      if (!paymentsEnabled()) {
        return res.status(503).json({
          error: 'PAYMENT_PROCESSING_NOT_ENABLED',
          message: PAYMENT_PILOT_DISABLED_MESSAGE,
        });
      }

      const { slug } = req.params;
      const { amount, donorEmail, donorName, coverFees, successUrl, cancelUrl } = req.body || {};

      const result = await createDonationCheckoutSessionFn(db, slug, {
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
      if (err.name === 'PaymentProcessingNotEnabledError') {
        return res.status(503).json({ error: 'PAYMENT_PROCESSING_NOT_ENABLED', message: err.message });
      }
      if (err.name === 'StripeConnectNotReadyError') {
        return res.status(409).json({ error: 'STRIPE_CONNECT_NOT_READY', message: err.message });
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

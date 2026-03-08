/**
 * Billing app factory - exports app instance for testing
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type Stripe from 'stripe';
import type { SubscriptionSyncService } from './services/subscriptionSyncService';
import { createStripeWebhookHandler } from './webhooks/stripeWebhook';

export type AppOptions = {
  stripe: Stripe;
  webhookSecret: string;
  sync: SubscriptionSyncService;
};

export function createApp(options: AppOptions): express.Application {
  const { stripe, webhookSecret, sync } = options;

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Stripe requires the raw body for signature validation.
  app.post(
    '/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    createStripeWebhookHandler({ stripe, webhookSecret, sync }),
  );

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  return app;
}

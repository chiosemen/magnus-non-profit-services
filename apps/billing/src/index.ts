import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { validateEnv } from '@magnus/config/envValidator';
import { loadEnv } from './config/env';
import { prisma } from './db';
import { createStripeClient } from './stripe/stripeClient';
import { SubscriptionSyncService } from './services/subscriptionSyncService';
import { createStripeWebhookHandler } from './webhooks/stripeWebhook';

async function main(): Promise<void> {
  validateEnv('billing');
  const env = loadEnv();

  // Fail-closed: DB must be reachable.
  await prisma.$queryRaw`SELECT 1`;

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  const sync = new SubscriptionSyncService({ db: prisma, stripe });

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Stripe requires the raw body for signature validation.
  app.post(
    '/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    createStripeWebhookHandler({ stripe, webhookSecret: env.STRIPE_WEBHOOK_SECRET, sync }),
  );

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`billing listening on ${env.PORT}`);
  });
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

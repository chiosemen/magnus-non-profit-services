import 'dotenv/config';
import { validateEnv } from '@magnus/config/envValidator';
import { loadEnv } from './config/env';
import { prisma } from './db';
import { createStripeClient } from './stripe/stripeClient';
import { SubscriptionSyncService } from './services/subscriptionSyncService';
import { createApp } from './app';
import { createLogger } from '@magnus/logging';

const logger = createLogger({ service: 'billing' });

async function main(): Promise<void> {
  validateEnv('billing');
  const env = loadEnv();

  // Fail-closed: DB must be reachable.
  await prisma.$queryRaw`SELECT 1`;

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  const sync = new SubscriptionSyncService({ db: prisma, stripe });

  const app = createApp({ stripe, webhookSecret: env.STRIPE_WEBHOOK_SECRET, sync });

  app.listen(env.PORT, () => {
    logger.info({ event: 'billing_server_started', port: env.PORT }, 'Billing server started');
  });
}

main().catch(err => {
  logger.error({ err, event: 'billing_startup_failed' }, 'Billing startup failed');
  process.exit(1);
});

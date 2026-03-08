import 'dotenv/config';
import { validateEnv } from '@magnus/config/envValidator';
import { loadEnv } from './config/env';
import { prisma } from './db';
import { createStripeClient } from './stripe/stripeClient';
import { SubscriptionSyncService } from './services/subscriptionSyncService';
import { createApp } from './app';

async function main(): Promise<void> {
  validateEnv('billing');
  const env = loadEnv();

  // Fail-closed: DB must be reachable.
  await prisma.$queryRaw`SELECT 1`;

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY);
  const sync = new SubscriptionSyncService({ db: prisma, stripe });

  const app = createApp({ stripe, webhookSecret: env.STRIPE_WEBHOOK_SECRET, sync });

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

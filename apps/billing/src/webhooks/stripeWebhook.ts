import type Stripe from 'stripe';
import type { Request, Response } from 'express';
import { SubscriptionSyncService } from '../services/subscriptionSyncService';
import { prisma } from '@magnus/db';
import { createLogger, getLogger } from '@magnus/logging';

const logger = createLogger({ service: 'billing', component: 'stripe-webhook' });

export function createStripeWebhookHandler(params: {
  stripe: Stripe;
  webhookSecret: string;
  sync: SubscriptionSyncService;
}) {
  return async (req: Request, res: Response) => {
    const sig = req.header('stripe-signature');
    if (!sig) {
      res.status(400).send('missing stripe-signature');
      return;
    }

    let event: Stripe.Event;
    try {
      event = params.stripe.webhooks.constructEvent(req.body, sig, params.webhookSecret);
    } catch {
      res.status(400).send('invalid signature');
      return;
    }

    // Idempotency check: deduplicate events using Stripe event.id
    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
    });
    if (existing) {
      // Already processed this event - idempotent success
      getLogger(logger).info(
        { event: 'stripe_webhook_duplicate_ignored', stripeEventId: event.id, stripeEventType: event.type },
        'Duplicate webhook event ignored'
      );
      res.json({ received: true, duplicate: true });
      return;
    }

    getLogger(logger).info(
      { event: 'stripe_webhook_processing_started', stripeEventId: event.id, stripeEventType: event.type },
      'Processing Stripe webhook event'
    );


    let succeeded = true;
    let error: string | null = null;

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await params.sync.syncFromCheckoutSessionCompleted(session);
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          await params.sync.syncFromSubscription(sub);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await params.sync.markPaymentFailed(invoice);
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await params.sync.markSubscriptionDeleted(sub);
          break;
        }
        default:
          // Ignore unrelated events.
          break;
      }

      // Record successful processing
      await prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          eventType: event.type,
          succeeded: true,
        },
      });

      getLogger(logger).info(
        { event: 'stripe_webhook_processed', stripeEventId: event.id, stripeEventType: event.type, succeeded },
        'Stripe webhook processed successfully'
      );
      res.json({ received: true });
    } catch (err) {
      succeeded = false;
      error = err instanceof Error ? err.message : 'INTERNAL_ERROR';

      getLogger(logger).error(
        { err, event: 'stripe_webhook_processing_failed', stripeEventId: event.id, stripeEventType: event.type },
        'Stripe webhook processing failed'
      );

      // Record failed processing attempt
      try {
        await prisma.stripeWebhookEvent.create({
          data: {
            eventId: event.id,
            eventType: event.type,
            succeeded: false,
            error,
          },
        });
      } catch (dbErr) {
        // Ignore errors recording failure (rare race condition or DB down)
        getLogger(logger).error(
          { err: dbErr, event: 'stripe_webhook_failure_recording_failed', stripeEventId: event.id },
          'Failed to record Stripe webhook failure'
        );
      }

      // Fail closed: return 500 so Stripe retries.
      res.status(500).json({ error });
    }
  };
}


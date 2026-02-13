import type Stripe from 'stripe';
import type { Request, Response } from 'express';
import { SubscriptionSyncService } from '../services/subscriptionSyncService';

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

      res.json({ received: true });
    } catch (err) {
      // Fail closed: return 500 so Stripe retries.
      res.status(500).json({ error: err instanceof Error ? err.message : 'INTERNAL_ERROR' });
    }
  };
}


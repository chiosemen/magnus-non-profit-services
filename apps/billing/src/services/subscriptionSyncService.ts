import type Stripe from 'stripe';
import { Prisma, type SubscriptionStatus, type SubscriptionTier } from '@magnus/db/types';
import type { PrismaClient } from '@magnus/db/types';
import { TierChangeService } from './tierChangeService';

export class SubscriptionSyncService {
  private readonly db: PrismaClient;
  private readonly stripe: Stripe;
  private readonly tierChange: TierChangeService;

  constructor(params: { db: PrismaClient; stripe: Stripe }) {
    this.db = params.db;
    this.stripe = params.stripe;
    this.tierChange = new TierChangeService();
  }

  async syncFromCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const orgId = session.metadata?.['orgId'];
    if (!orgId) throw new Error('STRIPE_SESSION_ORGID_MISSING');
    if (!session.subscription) throw new Error('STRIPE_SESSION_SUBSCRIPTION_MISSING');

    const subId = String(session.subscription);
    const subscription = await this.stripe.subscriptions.retrieve(subId, {
      expand: ['items.data.price.product'],
    });
    await this.syncFromSubscription(subscription, orgId);
  }

  async syncFromSubscription(subscription: Stripe.Subscription, orgIdHint?: string): Promise<void> {
    const expanded = await this.expandIfNeeded(subscription);
    const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const stripeSubscriptionId = subscription.id;

    const org = orgIdHint
      ? await this.db.organization.findUnique({
          where: { id: orgIdHint },
          select: { id: true, subscriptionTier: true, subscriptionStatus: true },
        })
      : await this.db.organization.findFirst({
          where: {
            OR: [{ stripeSubscriptionId }, { stripeCustomerId }],
          },
          select: { id: true, subscriptionTier: true, subscriptionStatus: true },
        });

    if (!org) throw new Error('ORG_NOT_FOUND_FOR_STRIPE_EVENT');

    const newTier = tierFromSubscription(expanded);
    const newStatus = statusFromSubscription(expanded.status);

    await this.db.$transaction(
      async tx => {
        const prevTier = org.subscriptionTier;
        const prevStatus = org.subscriptionStatus;

        await tx.organization.update({
          where: { id: org.id },
          data: {
            stripeCustomerId,
            stripeSubscriptionId,
            subscriptionTier: newTier,
            subscriptionStatus: newStatus,
          },
          select: { id: true },
        });

        await this.tierChange.handleChange({
          tx,
          orgId: org.id,
          prevTier: prevTier as any,
          newTier: newTier as any,
          prevStatus: prevStatus as any,
          newStatus: newStatus as any,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async markPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (!customerId && !subscriptionId) throw new Error('STRIPE_INVOICE_LINK_MISSING');

    const org = await this.db.organization.findFirst({
      where: {
        OR: [
          ...(subscriptionId ? [{ stripeSubscriptionId: subscriptionId }] : []),
          ...(customerId ? [{ stripeCustomerId: customerId }] : []),
        ],
      },
      select: { id: true, subscriptionTier: true, subscriptionStatus: true },
    });
    if (!org) throw new Error('ORG_NOT_FOUND_FOR_STRIPE_EVENT');

    await this.db.$transaction(async tx => {
      const prevTier = org.subscriptionTier;
      const prevStatus = org.subscriptionStatus;
      const newStatus: SubscriptionStatus = 'PAST_DUE';

      await tx.organization.update({
        where: { id: org.id },
        data: { subscriptionStatus: newStatus },
        select: { id: true },
      });

      await this.tierChange.handleChange({
        tx,
        orgId: org.id,
        prevTier: prevTier as any,
        newTier: prevTier as any,
        prevStatus: prevStatus as any,
        newStatus: newStatus as any,
      });
    });
  }

  async markSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const stripeSubscriptionId = subscription.id;

    const org = await this.db.organization.findFirst({
      where: { OR: [{ stripeSubscriptionId }, { stripeCustomerId }] },
      select: { id: true, subscriptionTier: true, subscriptionStatus: true },
    });
    if (!org) throw new Error('ORG_NOT_FOUND_FOR_STRIPE_EVENT');

    await this.db.$transaction(async tx => {
      const prevTier = org.subscriptionTier;
      const prevStatus = org.subscriptionStatus;
      const newStatus: SubscriptionStatus = 'CANCELED';

      await tx.organization.update({
        where: { id: org.id },
        data: { subscriptionStatus: newStatus },
        select: { id: true },
      });

      await this.tierChange.handleChange({
        tx,
        orgId: org.id,
        prevTier: prevTier as any,
        newTier: prevTier as any,
        prevStatus: prevStatus as any,
        newStatus: newStatus as any,
      });
    });
  }

  private async expandIfNeeded(subscription: Stripe.Subscription): Promise<Stripe.Subscription> {
    if (hasTierMetadata(subscription)) return subscription;
    return await this.stripe.subscriptions.retrieve(subscription.id, { expand: ['items.data.price.product'] });
  }
}

function statusFromSubscription(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === 'active' || status === 'trialing') return 'ACTIVE';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'PAST_DUE';
  if (status === 'canceled' || status === 'incomplete_expired') return 'CANCELED';
  // Fail closed on unknown.
  return 'PAST_DUE';
}

function tierFromSubscription(subscription: Stripe.Subscription): SubscriptionTier {
  for (const item of subscription.items.data) {
    const price: any = item.price;
    const tier = price?.metadata?.magnus_tier ?? price?.metadata?.tier ?? price?.product?.metadata?.magnus_tier;
    if (tier === 'STARTER' || tier === 'GROWTH' || tier === 'ENTERPRISE') return tier;
  }
  throw new Error('STRIPE_TIER_METADATA_MISSING');
}

function hasTierMetadata(subscription: Stripe.Subscription): boolean {
  for (const item of subscription.items.data) {
    const price: any = item.price;
    const tier = price?.metadata?.magnus_tier ?? price?.metadata?.tier;
    if (tier === 'STARTER' || tier === 'GROWTH' || tier === 'ENTERPRISE') return true;
    const product: any = price?.product;
    const pTier = product?.metadata?.magnus_tier;
    if (pTier === 'STARTER' || pTier === 'GROWTH' || pTier === 'ENTERPRISE') return true;
  }
  return false;
}

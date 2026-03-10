import type Stripe from 'stripe';
import { Prisma, type SubscriptionStatus, type SubscriptionTier } from '@magnus/db/types';
import type { PrismaClient } from '@magnus/db/types';
import { createLogger, getLogger } from '@magnus/logging';
import { TierChangeService } from './tierChangeService';

const logger = createLogger({ service: 'billing', component: 'subscription-sync' });

type OrgSyncTarget = {
  id: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
};

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
      : await this.requireOrgForStripeLink({
          context: 'subscription',
          stripeSubscriptionId,
          stripeCustomerId,
        });

    if (!org) {
      getLogger(logger).warn(
        { event: 'billing_org_id_hint_lookup_failed', orgIdHint },
        'orgIdHint lookup failed for Stripe event'
      );
      throw new Error('ORG_NOT_FOUND_FOR_STRIPE_EVENT');
    }

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

    const org = await this.requireOrgForStripeLink({
      context: 'invoice.payment_failed',
      stripeSubscriptionId: subscriptionId ?? null,
      stripeCustomerId: customerId ?? null,
    });

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

    const org = await this.requireOrgForStripeLink({
      context: 'customer.subscription.deleted',
      stripeSubscriptionId,
      stripeCustomerId,
    });

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

  private async requireOrgForStripeLink(params: {
    context: string;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
  }): Promise<OrgSyncTarget> {
    // Do not fallback silently: if subscriptionId exists, it must map uniquely to an org.
    if (params.stripeSubscriptionId) {
      const org = await this.db.organization.findUnique({
        where: { stripeSubscriptionId: params.stripeSubscriptionId },
        select: { id: true, subscriptionTier: true, subscriptionStatus: true },
      });
      if (!org) {
        getLogger(logger).warn(
          {
            event: 'billing_org_not_found_for_stripe_subscription',
            context: params.context,
            stripeSubscriptionId: params.stripeSubscriptionId,
          },
          'Organization not found for Stripe subscription'
        );
        throw new Error('ORG_NOT_FOUND_FOR_STRIPE_EVENT');
      }

      // Defensive: if the DB is missing unique constraints, detect duplicates and fail closed.
      const dup = await this.db.organization.findMany({
        where: { stripeSubscriptionId: params.stripeSubscriptionId },
        select: { id: true },
        take: 2,
      });
      if (dup.length > 1) {
        getLogger(logger).error(
          {
            event: 'billing_org_not_unique_for_stripe_subscription',
            context: params.context,
            stripeSubscriptionId: params.stripeSubscriptionId,
            orgIds: dup.map(d => d.id),
          },
          'Multiple organizations matched the Stripe subscription'
        );
        throw new Error('ORG_NOT_UNIQUE_FOR_STRIPE_EVENT');
      }
      return org;
    }

    if (params.stripeCustomerId) {
      const org = await this.db.organization.findUnique({
        where: { stripeCustomerId: params.stripeCustomerId },
        select: { id: true, subscriptionTier: true, subscriptionStatus: true },
      });
      if (!org) {
        getLogger(logger).warn(
          {
            event: 'billing_org_not_found_for_stripe_customer',
            context: params.context,
            stripeCustomerId: params.stripeCustomerId,
          },
          'Organization not found for Stripe customer'
        );
        throw new Error('ORG_NOT_FOUND_FOR_STRIPE_EVENT');
      }

      const dup = await this.db.organization.findMany({
        where: { stripeCustomerId: params.stripeCustomerId },
        select: { id: true },
        take: 2,
      });
      if (dup.length > 1) {
        getLogger(logger).error(
          {
            event: 'billing_org_not_unique_for_stripe_customer',
            context: params.context,
            stripeCustomerId: params.stripeCustomerId,
            orgIds: dup.map(d => d.id),
          },
          'Multiple organizations matched the Stripe customer'
        );
        throw new Error('ORG_NOT_UNIQUE_FOR_STRIPE_EVENT');
      }
      return org;
    }

    getLogger(logger).warn(
      { event: 'billing_stripe_event_org_lookup_missing', context: params.context },
      'Stripe event org lookup inputs were missing'
    );
    throw new Error('STRIPE_EVENT_ORG_LOOKUP_MISSING');
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

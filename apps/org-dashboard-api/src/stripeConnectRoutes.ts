import type { Express, RequestHandler } from 'express';
import Stripe from 'stripe';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  createStripeConnectOnboardingLink,
  getStripeConnectStatus,
  refreshStripeConnectOnboardingLink,
  type StripeConnectGateway,
} from '@magnus/org-autonomous-ops-context';

function webUrl(value: string | undefined, key: string): string {
  const raw = (value ?? '').trim();
  if (!raw) throw new Error(`${key}_MISSING`);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${key}_INVALID`);
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error(`${key}_INVALID`);
  }
  return parsed.toString();
}

export function createStripeConnectGateway(stripe: Stripe): StripeConnectGateway {
  return {
    async createAccount(orgId: string) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { orgId },
      });

      return {
        id: account.id,
        detailsSubmitted: Boolean(account.details_submitted),
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
        requirementsEventuallyDue: account.requirements?.eventually_due ?? [],
        disabledReason: account.requirements?.disabled_reason ?? null,
        country: account.country ?? null,
        defaultCurrency: account.default_currency ?? null,
      };
    },

    async retrieveAccount(stripeAccountId: string) {
      const account = await stripe.accounts.retrieve(stripeAccountId);
      return {
        id: account.id,
        detailsSubmitted: Boolean(account.details_submitted),
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
        requirementsEventuallyDue: account.requirements?.eventually_due ?? [],
        disabledReason: account.requirements?.disabled_reason ?? null,
        country: account.country ?? null,
        defaultCurrency: account.default_currency ?? null,
      };
    },

    async createOnboardingLink(params) {
      const link = await stripe.accountLinks.create({
        account: params.stripeAccountId,
        type: 'account_onboarding',
        return_url: params.returnUrl,
        refresh_url: params.refreshUrl,
      });

      return {
        url: link.url,
        expiresAt: new Date(link.expires_at * 1000),
      };
    },
  };
}

export function registerStripeConnectRoutes(
  app: Express,
  jwtAuth: RequestHandler,
  options?: {
    db?: PrismaClient;
    gateway?: StripeConnectGateway;
    returnUrl?: string;
    refreshUrl?: string;
  },
): void {
  const db = options?.db ?? (prisma as unknown as PrismaClient);
  const gateway = options?.gateway;
  const returnUrl = options?.returnUrl ?? webUrl(process.env['STRIPE_CONNECT_RETURN_URL'], 'STRIPE_CONNECT_RETURN_URL');
  const refreshUrl = options?.refreshUrl ?? webUrl(process.env['STRIPE_CONNECT_REFRESH_URL'], 'STRIPE_CONNECT_REFRESH_URL');

  app.get('/api/org/stripe-connect/status', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any)?.auth?.orgId as string | undefined;
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });

      const status = await getStripeConnectStatus(db, orgId);
      return res.json({ status });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/org/stripe-connect/onboarding-link', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any)?.auth?.orgId as string | undefined;
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });
      if (!gateway) return res.status(500).json({ error: 'STRIPE_GATEWAY_NOT_CONFIGURED' });

      const result = await createStripeConnectOnboardingLink(db, gateway, {
        orgId,
        returnUrl,
        refreshUrl,
      });
      return res.status(201).json({ onboarding: result });
    } catch (err: any) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') {
        return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      }
      return next(err);
    }
  });

  app.post('/api/org/stripe-connect/onboarding-link/refresh', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any)?.auth?.orgId as string | undefined;
      if (!orgId) return res.status(401).json({ error: 'AUTH_INVALID' });
      if (!gateway) return res.status(500).json({ error: 'STRIPE_GATEWAY_NOT_CONFIGURED' });

      const result = await refreshStripeConnectOnboardingLink(db, gateway, {
        orgId,
        returnUrl,
        refreshUrl,
      });
      return res.status(201).json({ onboarding: result });
    } catch (err: any) {
      if (err instanceof Error && err.message === 'STRIPE_CONNECT_NOT_FOUND') {
        return res.status(404).json({ error: 'STRIPE_CONNECT_NOT_FOUND' });
      }
      return next(err);
    }
  });
}

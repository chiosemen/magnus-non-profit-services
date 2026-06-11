/**
 * Magnus S4NP — Stripe Connect & Campaign Business Services
 */

import { PrismaClient, CampaignStatus, Campaign, StripeConnectAccount } from '@magnus/db/types';
import { Prisma as PrismaRuntime } from '@magnus/db/types';

// Custom error classes for clean error handling
export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(resource: string, id: string) {
    super(`${resource} with ID ${id} was not found.`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message: string = 'Access denied.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// Helper to sanitize/validate campaign slug
export function validateCampaignSlug(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(trimmed)) {
    throw new ValidationError('Campaign slug must be lowercase alphanumeric characters and hyphens only, and cannot start or end with a hyphen.');
  }
  return trimmed;
}

// Retrieve Stripe secret key from environment
function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not configured.');
  }
  return key;
}

// ─── Campaigns Logic ─────────────────────────────────────────────────────────

export async function listCampaigns(db: PrismaClient, orgId: string): Promise<Campaign[]> {
  if (!orgId) throw new ValidationError('Organization ID is required.');
  return await db.campaign.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCampaignDetail(db: PrismaClient, orgId: string, campaignId: string): Promise<Campaign> {
  if (!orgId) throw new ValidationError('Organization ID is required.');
  if (!campaignId) throw new ValidationError('Campaign ID is required.');

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign', campaignId);
  }

  if (campaign.orgId !== orgId) {
    throw new ForbiddenError('You do not have permission to view this campaign.');
  }

  return campaign;
}

export async function createCampaign(
  db: PrismaClient,
  orgId: string,
  data: { name: string; slug: string; description?: string; goalAmount?: number; currency?: string }
): Promise<Campaign> {
  if (!orgId) throw new ValidationError('Organization ID is required.');
  if (!data.name || !data.name.trim()) {
    throw new ValidationError('Campaign name is required.');
  }
  if (!data.slug) {
    throw new ValidationError('Campaign slug is required.');
  }

  const sanitizedSlug = validateCampaignSlug(data.slug);

  let goal: PrismaRuntime.Decimal | null = null;
  if (data.goalAmount !== undefined && data.goalAmount !== null) {
    if (data.goalAmount <= 0) {
      throw new ValidationError('Campaign goal amount must be positive.');
    }
    goal = new PrismaRuntime.Decimal(data.goalAmount);
  }

  try {
    return await db.campaign.create({
      data: {
        orgId,
        name: data.name.trim(),
        slug: sanitizedSlug,
        description: data.description?.trim() || null,
        goalAmount: goal,
        currency: data.currency?.trim().toUpperCase() || 'USD',
        status: CampaignStatus.DRAFT,
      },
    });
  } catch (err: any) {
    if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ValidationError(`Campaign slug "${sanitizedSlug}" is already taken.`);
    }
    throw err;
  }
}

export async function updateCampaign(
  db: PrismaClient,
  orgId: string,
  campaignId: string,
  data: { name?: string; slug?: string; description?: string; goalAmount?: number | null; currency?: string }
): Promise<Campaign> {
  if (!orgId) throw new ValidationError('Organization ID is required.');
  if (!campaignId) throw new ValidationError('Campaign ID is required.');

  const campaign = await getCampaignDetail(db, orgId, campaignId);

  const updateData: any = {};
  if (data.name !== undefined) {
    if (!data.name.trim()) throw new ValidationError('Campaign name cannot be empty.');
    updateData.name = data.name.trim();
  }

  if (data.slug !== undefined) {
    updateData.slug = validateCampaignSlug(data.slug);
  }

  if (data.description !== undefined) {
    updateData.description = data.description?.trim() || null;
  }

  if (data.goalAmount !== undefined) {
    if (data.goalAmount !== null) {
      if (data.goalAmount <= 0) throw new ValidationError('Campaign goal amount must be positive.');
      updateData.goalAmount = new PrismaRuntime.Decimal(data.goalAmount);
    } else {
      updateData.goalAmount = null;
    }
  }

  if (data.currency !== undefined) {
    if (!data.currency.trim()) throw new ValidationError('Currency cannot be empty.');
    updateData.currency = data.currency.trim().toUpperCase();
  }

  try {
    return await db.campaign.update({
      where: { id: campaignId },
      data: updateData,
    });
  } catch (err: any) {
    if (err instanceof PrismaRuntime.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ValidationError(`Campaign slug "${updateData.slug || campaign.slug}" is already taken.`);
    }
    throw err;
  }
}

export async function publishCampaign(db: PrismaClient, orgId: string, campaignId: string): Promise<Campaign> {
  const campaign = await getCampaignDetail(db, orgId, campaignId);

  // Check if organization has an active onboarded Stripe Connect account
  const stripeAccount = await db.stripeConnectAccount.findUnique({
    where: { orgId },
  });

  if (!stripeAccount || !stripeAccount.chargesEnabled) {
    throw new ValidationError('Cannot publish campaign. Organization must have a fully onboarded Stripe Connect account with payments enabled.');
  }

  return await db.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.LIVE },
  });
}

export async function unpublishCampaign(db: PrismaClient, orgId: string, campaignId: string): Promise<Campaign> {
  await getCampaignDetail(db, orgId, campaignId);
  return await db.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.DRAFT },
  });
}

// ─── Stripe Connect Onboarding Logic ─────────────────────────────────────────

export async function createStripeOnboardingLink(
  db: PrismaClient,
  orgId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ url: string }> {
  if (!orgId) throw new ValidationError('Organization ID is required.');
  if (!returnUrl) throw new ValidationError('Return URL is required.');
  if (!refreshUrl) throw new ValidationError('Refresh URL is required.');

  const secretKey = getStripeSecretKey();

  let stripeAccount = await db.stripeConnectAccount.findUnique({
    where: { orgId },
  });

  let stripeAccountId = stripeAccount?.stripeAccountId;

  if (!stripeAccountId) {
    // 1. Create Stripe Express Account
    const accountResponse = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'type': 'express',
        'capabilities[card_payments][requested]': 'true',
        'capabilities[transfers][requested]': 'true',
      }),
    });

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text();
      throw new Error(`Stripe Account Creation Failed: ${errorText}`);
    }

    const accountData = await accountResponse.json() as any;
    if (!accountData.id) {
      throw new Error('Stripe account creation returned no account ID.');
    }
    stripeAccountId = accountData.id;

    // 2. Save account locally
    stripeAccount = await db.stripeConnectAccount.create({
      data: {
        orgId,
        stripeAccountId: stripeAccountId!,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
    });
  }

  if (!stripeAccountId) {
    throw new Error('Failed to identify or create a valid connected Stripe account.');
  }

  // 3. Create Stripe Account Link
  const linkResponse = await fetch('https://api.stripe.com/v1/account_links', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'account': stripeAccountId,
      'refresh_url': refreshUrl,
      'return_url': returnUrl,
      'type': 'account_onboarding',
    }),
  });

  if (!linkResponse.ok) {
    const errorText = await linkResponse.text();
    throw new Error(`Stripe Account Link Generation Failed: ${errorText}`);
  }

  const linkData = await linkResponse.json() as any;
  return { url: linkData.url };
}

export async function getStripeAccountStatus(db: PrismaClient, orgId: string): Promise<StripeConnectAccount> {
  if (!orgId) throw new ValidationError('Organization ID is required.');

  const stripeAccount = await db.stripeConnectAccount.findUnique({
    where: { orgId },
  });

  if (!stripeAccount) {
    throw new NotFoundError('StripeConnectAccount', orgId);
  }

  const secretKey = getStripeSecretKey();

  const response = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccount.stripeAccountId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Stripe account status: ${errorText}`);
  }

  const accountData = await response.json() as any;

  const chargesEnabled = accountData.charges_enabled === true;
  const payoutsEnabled = accountData.payouts_enabled === true;
  const detailsSubmitted = accountData.details_submitted === true;

  return await db.stripeConnectAccount.update({
    where: { orgId },
    data: {
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
    },
  });
}

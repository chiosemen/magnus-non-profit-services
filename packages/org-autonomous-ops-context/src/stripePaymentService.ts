/**
 * Magnus S4NP — Stripe Connect checkout and Webhook processing services
 */

import { PrismaClient, CampaignStatus, Campaign, DonationSource, ReceiptStatus } from '@magnus/db/types';
import { Prisma as PrismaRuntime } from '@magnus/db/types';
import crypto from 'crypto';

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

// ─── Fee Coverage Utility ───────────────────────────────────────────────────

export function calculateFeeCoverage(netAmount: number): { grossAmount: number; feeCovered: number } {
  if (netAmount <= 0) {
    throw new ValidationError('Donation amount must be positive.');
  }
  // Formula: gross = (net + 0.30) / 0.971
  const gross = (netAmount + 0.30) / 0.971;
  const grossAmount = Math.round(gross * 100) / 100;
  const feeCovered = Math.round((grossAmount - netAmount) * 100) / 100;
  return { grossAmount, feeCovered };
}

// ─── Public Campaign Lookup ──────────────────────────────────────────────────

export async function getPublicCampaign(
  db: PrismaClient,
  slug: string
): Promise<{ campaign: Campaign; organizationName: string }> {
  if (!slug) throw new ValidationError('Slug is required.');

  const campaign = await db.campaign.findUnique({
    where: { slug },
    include: {
      organization: true,
    },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign', slug);
  }

  if (campaign.status !== CampaignStatus.LIVE) {
    throw new ValidationError('Campaign is not currently accepting donations.');
  }

  return {
    campaign,
    organizationName: campaign.organization.name,
  };
}

// ─── Create Checkout Redirect Link ───────────────────────────────────────────

export async function createDonationCheckoutSession(
  db: PrismaClient,
  slug: string,
  data: {
    amount: number;
    donorEmail: string;
    donorName: string;
    coverFees: boolean;
    successUrl: string;
    cancelUrl: string;
  }
): Promise<{ url: string; stripeCheckoutSessionId: string }> {
  if (!slug) throw new ValidationError('Slug is required.');
  if (data.amount <= 0) throw new ValidationError('Amount must be positive.');
  if (!data.donorEmail) throw new ValidationError('Donor email is required.');
  if (!data.donorName || !data.donorName.trim()) throw new ValidationError('Donor name is required.');
  if (!data.successUrl || !data.cancelUrl) throw new ValidationError('Redirect URLs are required.');

  const campaign = await db.campaign.findUnique({
    where: { slug },
    include: {
      organization: {
        include: {
          stripeConnectAccount: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new NotFoundError('Campaign', slug);
  }

  if (campaign.status !== CampaignStatus.LIVE) {
    throw new ValidationError('Campaign is not live.');
  }

  const stripeAccount = campaign.organization.stripeConnectAccount;
  if (!stripeAccount || !stripeAccount.chargesEnabled) {
    throw new ValidationError('Organization payments onboarding is incomplete.');
  }

  // Calculate gross fee coverage if opted in
  let grossAmount = data.amount;
  let feeCovered = 0;
  if (data.coverFees) {
    const feeCalculation = calculateFeeCoverage(data.amount);
    grossAmount = feeCalculation.grossAmount;
    feeCovered = feeCalculation.feeCovered;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }

  // Call Stripe API to create Checkout Session
  // We use Direct Charge mapping: passing Stripe-Account header to charge directly on the connected account
  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeSecretKey}`,
      'Stripe-Account': stripeAccount.stripeAccountId,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'payment_method_types[0]': 'card',
      'mode': 'payment',
      'line_items[0][price_data][currency]': campaign.currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': `Donation to ${campaign.name}`,
      'line_items[0][price_data][unit_amount]': Math.round(grossAmount * 100).toString(),
      'line_items[0][quantity]': '1',
      'customer_email': data.donorEmail,
      'success_url': data.successUrl,
      'cancel_url': data.cancelUrl,
      'metadata[campaignId]': campaign.id,
      'metadata[orgId]': campaign.orgId,
      'metadata[donorEmail]': data.donorEmail,
      'metadata[donorName]': data.donorName.trim(),
      'metadata[netAmount]': data.amount.toString(),
      'metadata[feeCovered]': feeCovered.toString(),
    }),
  });

  if (!stripeResponse.ok) {
    const errorText = await stripeResponse.text();
    throw new Error(`Stripe Checkout Session Generation Failed: ${errorText}`);
  }

  const sessionData = await stripeResponse.json() as any;
  const stripeCheckoutSessionId = sessionData.id;

  // Persist Donation Intent
  await db.campaignDonationIntent.create({
    data: {
      orgId: campaign.orgId,
      campaignId: campaign.id,
      stripeCheckoutSessionId,
      amount: new PrismaRuntime.Decimal(data.amount),
      feeCovered: new PrismaRuntime.Decimal(feeCovered),
      currency: campaign.currency,
      donorEmail: data.donorEmail,
      donorName: data.donorName.trim(),
      status: 'PENDING',
    },
  });

  return { url: sessionData.url, stripeCheckoutSessionId };
}

// ─── Webhook Signature Verification ──────────────────────────────────────────

export function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(',');
  let timestamp = '';
  let v1 = '';

  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key === 't') timestamp = val;
    if (key === 'v1') v1 = val;
  }

  if (!timestamp || !v1) return false;

  // Prevent replay attacks (e.g. 5 minute window - 300 seconds)
  const tolerance = 300;
  const now = Math.floor(Date.now() / 1000);
  const eventTime = parseInt(timestamp, 10);
  if (Number.isNaN(eventTime) || Math.abs(now - eventTime) > tolerance) {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  const computedSignature = hmac.digest('hex');

  const computedBuffer = Buffer.from(computedSignature, 'hex');
  const v1Buffer = Buffer.from(v1, 'hex');

  if (computedBuffer.length !== v1Buffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, v1Buffer);
}

// ─── Webhook Event Processing ───────────────────────────────────────────────

export async function processWebhookEvent(db: PrismaClient, rawEvent: any): Promise<void> {
  const eventId = rawEvent.id;
  if (!eventId) throw new ValidationError('Event ID is required.');

  // Idempotency: check if already processed
  const existingEvent = await db.stripeWebhookEvent.findUnique({
    where: { eventId },
  });

  if (existingEvent) {
    return; // Already processed, ignore to maintain idempotency
  }

  // Record incoming event to lock it
  await db.stripeWebhookEvent.create({
    data: { eventId, processed: false },
  });

  if (rawEvent.type === 'checkout.session.completed') {
    const session = rawEvent.data.object;
    const metadata = session.metadata || {};

    const orgId = metadata.orgId;
    const campaignId = metadata.campaignId;
    const donorEmail = metadata.donorEmail;
    const donorName = metadata.donorName;

    const netAmountStr = metadata.netAmount;
    const feeCoveredStr = metadata.feeCovered;

    if (!orgId || !campaignId || !donorEmail || !donorName || !netAmountStr) {
      throw new ValidationError('Checkout session metadata is incomplete.');
    }

    const netAmount = parseFloat(netAmountStr);
    const feeCovered = parseFloat(feeCoveredStr || '0');

    await db.$transaction(async (tx) => {
      // Find or create Donor record scoped to this orgId
      let donor = await tx.donor.findUnique({
        where: {
          orgId_email: {
            orgId,
            email: donorEmail,
          },
        },
      });

      if (!donor) {
        donor = await tx.donor.create({
          data: {
            orgId,
            name: donorName,
            email: donorEmail,
            donorType: 'INDIVIDUAL',
          },
        });
      }

      // Check if Donation record already exists for this stripeCheckoutSessionId
      const existingDonation = await tx.donation.findUnique({
        where: { stripeCheckoutSessionId: session.id },
      });

      if (!existingDonation) {
        // Create Donation ledger record
        const donation = await tx.donation.create({
          data: {
            orgId,
            donorId: donor.id,
            campaignId,
            amount: new PrismaRuntime.Decimal(netAmount),
            feeCovered: new PrismaRuntime.Decimal(feeCovered),
            currency: (session.currency || 'USD').toUpperCase(),
            receivedAt: new Date(session.created * 1000),
            paymentMethod: 'Stripe Checkout',
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || null,
            source: DonationSource.STRIPE,
            notes: `Stripe donation via campaign. Charge: ${session.amount_total / 100} ${session.currency.toUpperCase()}`,
          },
        });

        // Sequence sequential receipt number per organization
        const receiptCount = await tx.donationReceipt.count({
          where: { orgId },
        });
        const receiptNumber = `REC-${new Date().getFullYear()}-${(receiptCount + 1).toString().padStart(6, '0')}`;

        // Create receipt-ready status record in DRAFT
        await tx.donationReceipt.create({
          data: {
            orgId,
            donationId: donation.id,
            receiptNumber,
            status: ReceiptStatus.DRAFT,
          },
        });
      }

      // Update donation intent to COMPLETED
      await tx.campaignDonationIntent.updateMany({
        where: { stripeCheckoutSessionId: session.id },
        data: { status: 'COMPLETED' },
      });
    });
  }

  // Mark webhook event as processed
  await db.stripeWebhookEvent.update({
    where: { eventId },
    data: { processed: true },
  });
}

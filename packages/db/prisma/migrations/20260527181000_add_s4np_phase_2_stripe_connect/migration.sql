-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'LIVE', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "DonationSource" ADD VALUE 'STRIPE';

-- AlterTable
ALTER TABLE "Donation" ADD COLUMN     "campaignId" UUID,
ADD COLUMN     "feeCovered" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "stripeCheckoutSessionId" VARCHAR(256),
ADD COLUMN     "stripePaymentIntentId" VARCHAR(256);

-- CreateTable
CREATE TABLE "StripeConnectAccount" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "stripeAccountId" VARCHAR(255) NOT NULL,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeConnectAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "slug" VARCHAR(256) NOT NULL,
    "description" TEXT,
    "goalAmount" DECIMAL(12,2),
    "currency" VARCHAR(8) NOT NULL DEFAULT 'USD',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDonationIntent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "stripeCheckoutSessionId" VARCHAR(256) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "feeCovered" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'USD',
    "donorEmail" VARCHAR(256) NOT NULL,
    "donorName" VARCHAR(256) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDonationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" UUID NOT NULL,
    "eventId" VARCHAR(256) NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnectAccount_orgId_key" ON "StripeConnectAccount"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnectAccount_stripeAccountId_key" ON "StripeConnectAccount"("stripeAccountId");

-- CreateIndex
CREATE INDEX "StripeConnectAccount_orgId_idx" ON "StripeConnectAccount"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_orgId_idx" ON "Campaign"("orgId");

-- CreateIndex
CREATE INDEX "Campaign_slug_idx" ON "Campaign"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDonationIntent_stripeCheckoutSessionId_key" ON "CampaignDonationIntent"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "CampaignDonationIntent_orgId_idx" ON "CampaignDonationIntent"("orgId");

-- CreateIndex
CREATE INDEX "CampaignDonationIntent_campaignId_idx" ON "CampaignDonationIntent"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_stripePaymentIntentId_key" ON "Donation"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_stripeCheckoutSessionId_key" ON "Donation"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "Donation_campaignId_idx" ON "Donation"("campaignId");

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeConnectAccount" ADD CONSTRAINT "StripeConnectAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDonationIntent" ADD CONSTRAINT "CampaignDonationIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

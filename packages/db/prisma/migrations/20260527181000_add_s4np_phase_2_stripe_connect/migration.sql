-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignStatus') THEN
        CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'LIVE', 'ARCHIVED');
    END IF;
END $$;

-- AlterEnum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'DonationSource'
          AND e.enumlabel = 'STRIPE'
    ) THEN
        ALTER TYPE "DonationSource" ADD VALUE 'STRIPE';
    END IF;
END $$;

-- AlterTable
ALTER TABLE "Donation"
ADD COLUMN IF NOT EXISTS "campaignId" UUID,
ADD COLUMN IF NOT EXISTS "feeCovered" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" VARCHAR(256),
ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" VARCHAR(256);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "slug" VARCHAR(256) NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "goalAmount" DECIMAL(14,2),
    "currency" VARCHAR(8) NOT NULL DEFAULT 'USD',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignDonationIntent" (
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
CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
    "id" UUID NOT NULL,
    "eventId" VARCHAR(256) NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_orgId_slug_key" ON "Campaign"("orgId", "slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_orgId_idx" ON "Campaign"("orgId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_orgId_status_idx" ON "Campaign"("orgId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_orgId_createdAt_idx" ON "Campaign"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignDonationIntent_stripeCheckoutSessionId_key" ON "CampaignDonationIntent"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignDonationIntent_orgId_idx" ON "CampaignDonationIntent"("orgId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CampaignDonationIntent_campaignId_idx" ON "CampaignDonationIntent"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Donation_stripePaymentIntentId_key" ON "Donation"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Donation_stripeCheckoutSessionId_key" ON "Donation"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Donation_campaignId_idx" ON "Donation"("campaignId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Donation_campaignId_fkey'
          AND conrelid = '"Donation"'::regclass
    ) THEN
        ALTER TABLE "Donation" ADD CONSTRAINT "Donation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Campaign_orgId_fkey'
          AND conrelid = '"Campaign"'::regclass
    ) THEN
        ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CampaignDonationIntent_campaignId_fkey'
          AND conrelid = '"CampaignDonationIntent"'::regclass
    ) THEN
        ALTER TABLE "CampaignDonationIntent" ADD CONSTRAINT "CampaignDonationIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

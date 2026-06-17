-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StripeConnectOnboardingStatus') THEN
        CREATE TYPE "StripeConnectOnboardingStatus" AS ENUM (
            'NOT_STARTED',
            'LINK_CREATED',
            'IN_PROGRESS',
            'ENABLED',
            'RESTRICTED'
        );
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StripeConnectAccount" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "stripeAccountId" VARCHAR(255) NOT NULL,
    "onboardingStatus" "StripeConnectOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requirementsCurrentlyDue" JSONB,
    "requirementsEventuallyDue" JSONB,
    "disabledReason" TEXT,
    "country" VARCHAR(2),
    "defaultCurrency" VARCHAR(8),
    "onboardingLinkLastCreatedAt" TIMESTAMP(3),
    "onboardingLinkExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeConnectAccount_pkey" PRIMARY KEY ("id")
);

-- Converge any earlier lightweight Stripe Connect table to the canonical shape.
ALTER TABLE "StripeConnectAccount"
ADD COLUMN IF NOT EXISTS "onboardingStatus" "StripeConnectOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN IF NOT EXISTS "requirementsCurrentlyDue" JSONB,
ADD COLUMN IF NOT EXISTS "requirementsEventuallyDue" JSONB,
ADD COLUMN IF NOT EXISTS "disabledReason" TEXT,
ADD COLUMN IF NOT EXISTS "country" VARCHAR(2),
ADD COLUMN IF NOT EXISTS "defaultCurrency" VARCHAR(8),
ADD COLUMN IF NOT EXISTS "onboardingLinkLastCreatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "onboardingLinkExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StripeConnectAccount_orgId_key" ON "StripeConnectAccount"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StripeConnectAccount_stripeAccountId_key" ON "StripeConnectAccount"("stripeAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StripeConnectAccount_orgId_idx" ON "StripeConnectAccount"("orgId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StripeConnectAccount_onboardingStatus_idx" ON "StripeConnectAccount"("onboardingStatus");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'StripeConnectAccount_orgId_fkey'
          AND conrelid = '"StripeConnectAccount"'::regclass
    ) THEN
        ALTER TABLE "StripeConnectAccount"
        ADD CONSTRAINT "StripeConnectAccount_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill compatibility rows for organizations that already carry a Stripe account id.
INSERT INTO "StripeConnectAccount" (
    "id",
    "orgId",
    "stripeAccountId",
    "onboardingStatus",
    "detailsSubmitted",
    "chargesEnabled",
    "payoutsEnabled",
    "createdAt",
    "updatedAt"
)
SELECT
    o."id",
    o."id",
    o."stripeAccountId",
    'NOT_STARTED'::"StripeConnectOnboardingStatus",
    false,
    false,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" o
WHERE o."stripeAccountId" IS NOT NULL
ON CONFLICT DO NOTHING;

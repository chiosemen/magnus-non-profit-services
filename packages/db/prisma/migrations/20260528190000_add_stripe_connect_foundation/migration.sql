-- CreateEnum
CREATE TYPE "StripeConnectOnboardingStatus" AS ENUM (
    'NOT_STARTED',
    'LINK_CREATED',
    'IN_PROGRESS',
    'ENABLED',
    'RESTRICTED'
);

-- CreateTable
CREATE TABLE "StripeConnectAccount" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnectAccount_orgId_key" ON "StripeConnectAccount"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeConnectAccount_stripeAccountId_key" ON "StripeConnectAccount"("stripeAccountId");

-- CreateIndex
CREATE INDEX "StripeConnectAccount_onboardingStatus_idx" ON "StripeConnectAccount"("onboardingStatus");

-- AddForeignKey
ALTER TABLE "StripeConnectAccount"
ADD CONSTRAINT "StripeConnectAccount_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
  AND NOT EXISTS (
    SELECT 1
    FROM "StripeConnectAccount" s
    WHERE s."orgId" = o."id"
  );

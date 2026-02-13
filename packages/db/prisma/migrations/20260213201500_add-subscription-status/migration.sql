-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "Organization"
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';


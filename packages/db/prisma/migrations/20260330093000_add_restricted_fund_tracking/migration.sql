-- Restricted fund tracking (v1)
-- NOTE: This is deterministic tracking, not GAAP-perfect fund accounting.

CREATE TABLE "RestrictedFund" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "totalRestrictedAmount" DECIMAL(12,2) NOT NULL,
  "restrictionPurpose" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "allowableSpendCategories" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RestrictedFund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestrictedFundUsageEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "restrictedFundId" UUID NOT NULL,
  "orgId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "categoryCode" TEXT,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RestrictedFundUsageEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RestrictedFund"
  ADD CONSTRAINT "RestrictedFund_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestrictedFundUsageEvent"
  ADD CONSTRAINT "RestrictedFundUsageEvent_restrictedFundId_fkey" FOREIGN KEY ("restrictedFundId") REFERENCES "RestrictedFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RestrictedFundUsageEvent"
  ADD CONSTRAINT "RestrictedFundUsageEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RestrictedFund_orgId_endDate_idx" ON "RestrictedFund"("orgId", "endDate");
CREATE INDEX "RestrictedFund_orgId_createdAt_idx" ON "RestrictedFund"("orgId", "createdAt");
CREATE INDEX "RestrictedFundUsageEvent_orgId_occurredAt_idx" ON "RestrictedFundUsageEvent"("orgId", "occurredAt");
CREATE INDEX "RestrictedFundUsageEvent_restrictedFundId_occurredAt_idx" ON "RestrictedFundUsageEvent"("restrictedFundId", "occurredAt");


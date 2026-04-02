-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertOwnerType" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- AlterTable
ALTER TABLE "Alert"
ADD COLUMN "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolutionSummary" TEXT,
ADD COLUMN "ownerType" "AlertOwnerType",
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "relatedAgentRunId" UUID,
ADD COLUMN "relatedHandoffId" UUID;

-- Backfill status deterministically from acknowledgedAt (historical truth only).
UPDATE "Alert"
SET "status" = 'ACKNOWLEDGED'
WHERE "acknowledgedAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "AlertAuditEntry" (
    "id" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "fromStatus" "AlertStatus",
    "toStatus" "AlertStatus",
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "detail" JSONB,

    CONSTRAINT "AlertAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertAuditEntry_alertId_createdAt_idx" ON "AlertAuditEntry"("alertId", "createdAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_relatedAgentRunId_fkey" FOREIGN KEY ("relatedAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_relatedHandoffId_fkey" FOREIGN KEY ("relatedHandoffId") REFERENCES "AgentHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertAuditEntry" ADD CONSTRAINT "AlertAuditEntry_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "AuditPrepCategory" AS ENUM ('GOVERNANCE_BOARD_MINUTES', 'BANK_CASH_RECONCILIATIONS', 'PAYROLL_COMPENSATION', 'GRANT_RESTRICTED_FUNDS', 'CONTRACTS_LEASES_AGREEMENTS', 'PRIOR_YEAR_FINDING_REMEDIATION');

-- CreateEnum
CREATE TYPE "AuditPrepItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED');

-- CreateTable
CREATE TABLE "OrgAuditPrepItem" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "templateItemKey" TEXT NOT NULL,
    "category" "AuditPrepCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AuditPrepItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "targetDate" TIMESTAMP(3),
    "assignee" TEXT,
    "notes" TEXT,
    "evidenceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgAuditPrepItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAuditPrepItem_orgId_templateItemKey_key" ON "OrgAuditPrepItem"("orgId", "templateItemKey");

-- CreateIndex
CREATE INDEX "OrgAuditPrepItem_orgId_idx" ON "OrgAuditPrepItem"("orgId");

-- CreateIndex
CREATE INDEX "OrgAuditPrepItem_orgId_category_idx" ON "OrgAuditPrepItem"("orgId", "category");

-- CreateIndex
CREATE INDEX "OrgAuditPrepItem_orgId_status_idx" ON "OrgAuditPrepItem"("orgId", "status");

-- AddForeignKey
ALTER TABLE "OrgAuditPrepItem" ADD CONSTRAINT "OrgAuditPrepItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AutonomousOpsBoundaryMode" AS ENUM ('internal_only', 'ask_first', 'never');

-- CreateTable
CREATE TABLE "OrgAutonomousOpsSettings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "enabledAgents" JSONB NOT NULL,
  "maxAutonomyTier" "AutonomyTier" NOT NULL DEFAULT 'TIER_A_AUTONOMOUS',
  "agentBoundaryOverrides" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrgAutonomousOpsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgAutonomousOpsSettings_orgId_key" ON "OrgAutonomousOpsSettings"("orgId");

-- CreateIndex
CREATE INDEX "OrgAutonomousOpsSettings_orgId_idx" ON "OrgAutonomousOpsSettings"("orgId");

-- AddForeignKey
ALTER TABLE "OrgAutonomousOpsSettings" ADD CONSTRAINT "OrgAutonomousOpsSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AutonomyTier" AS ENUM ('TIER_A_AUTONOMOUS', 'TIER_B_ASK_FIRST', 'TIER_C_NEVER');

-- CreateEnum
CREATE TYPE "AgentHandoffStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrgContextFileKind" AS ENUM ('ORG_IDENTITY', 'ORG_SOUL', 'ORG_AGENTS', 'ORG_MEMORY', 'ORG_HEARTBEAT');

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "autonomyTier" "AutonomyTier" NOT NULL DEFAULT 'TIER_A_AUTONOMOUS',
ADD COLUMN "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sourceRefs" JSONB,
ADD COLUMN "humanReviewedAt" TIMESTAMP(3),
ADD COLUMN "humanReviewedBy" TEXT;

-- CreateTable
CREATE TABLE "AgentHandoff" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "fromAgentName" TEXT NOT NULL,
    "toAgentName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "status" "AgentHandoffStatus" NOT NULL DEFAULT 'OPEN',
    "sourceEvidence" JSONB,
    "relatedAgentRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AgentHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgContextFile" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "kind" "OrgContextFileKind" NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgContextFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentOperationalMemoryEntry" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "agentName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sourceRefs" JSONB,
    "agentRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentOperationalMemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentHandoff_orgId_status_idx" ON "AgentHandoff"("orgId", "status");

-- CreateIndex
CREATE INDEX "AgentHandoff_orgId_createdAt_idx" ON "AgentHandoff"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgContextFile_orgId_kind_key" ON "OrgContextFile"("orgId", "kind");

-- CreateIndex
CREATE INDEX "AgentOperationalMemoryEntry_orgId_createdAt_idx" ON "AgentOperationalMemoryEntry"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentOperationalMemoryEntry_orgId_agentName_idx" ON "AgentOperationalMemoryEntry"("orgId", "agentName");

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentHandoff" ADD CONSTRAINT "AgentHandoff_relatedAgentRunId_fkey" FOREIGN KEY ("relatedAgentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgContextFile" ADD CONSTRAINT "OrgContextFile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOperationalMemoryEntry" ADD CONSTRAINT "AgentOperationalMemoryEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOperationalMemoryEntry" ADD CONSTRAINT "AgentOperationalMemoryEntry_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "GrantProposalStatus" AS ENUM ('DRAFT', 'GENERATING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "GrantProposal" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "funderName" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "status" "GrantProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "sections" JSONB NOT NULL,
    "qualityScore" INTEGER,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrantProposal_orgId_status_idx" ON "GrantProposal"("orgId", "status");

-- CreateIndex
CREATE INDEX "GrantProposal_orgId_createdAt_idx" ON "GrantProposal"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "GrantProposal" ADD CONSTRAINT "GrantProposal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

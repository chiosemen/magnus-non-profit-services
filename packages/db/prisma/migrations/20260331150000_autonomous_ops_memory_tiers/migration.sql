-- AlterTable
ALTER TABLE "AgentOperationalMemoryEntry" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN "recallDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recallDisabledReason" TEXT;

-- CreateIndex
CREATE INDEX "AgentOperationalMemoryEntry_orgId_recallDisabled_idx" ON "AgentOperationalMemoryEntry"("orgId", "recallDisabled");

-- CreateTable
CREATE TABLE "OrgCuratedMemoryItem" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sourceRefs" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "OrgCuratedMemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSemanticMemoryChunk" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "chunkText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "sourceRefs" JSONB,
    "embeddingReady" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgSemanticMemoryChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgCuratedMemoryItem_orgId_isActive_idx" ON "OrgCuratedMemoryItem"("orgId", "isActive");

-- CreateIndex
CREATE INDEX "OrgCuratedMemoryItem_orgId_updatedAt_idx" ON "OrgCuratedMemoryItem"("orgId", "updatedAt");

-- CreateIndex
CREATE INDEX "OrgSemanticMemoryChunk_orgId_createdAt_idx" ON "OrgSemanticMemoryChunk"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgCuratedMemoryItem" ADD CONSTRAINT "OrgCuratedMemoryItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgSemanticMemoryChunk" ADD CONSTRAINT "OrgSemanticMemoryChunk_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve prior Claude usage log table for audit/history (no delete).
ALTER TABLE "ClaudeUsageLog" RENAME TO "ClaudeUsageLogLegacy";

-- CreateTable
CREATE TABLE "ClaudeUsageLog" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "workerId" UUID,
    "promptType" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "cost" DECIMAL(12,6) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaudeUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaudeUsageLog_orgId_timestamp_idx" ON "ClaudeUsageLog"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "ClaudeUsageLog_orgId_promptType_timestamp_idx" ON "ClaudeUsageLog"("orgId", "promptType", "timestamp");

-- AddForeignKey
ALTER TABLE "ClaudeUsageLog" ADD CONSTRAINT "ClaudeUsageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaudeUsageLog" ADD CONSTRAINT "ClaudeUsageLog_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;


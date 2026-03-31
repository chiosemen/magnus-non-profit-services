-- CreateTable
CREATE TABLE "AgentHandoffAuditEntry" (
    "id" UUID NOT NULL,
    "handoffId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "fromStatus" "AgentHandoffStatus",
    "toStatus" "AgentHandoffStatus",
    "actorType" TEXT NOT NULL,
    "actorName" TEXT,
    "detail" JSONB,

    CONSTRAINT "AgentHandoffAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentHandoffAuditEntry_handoffId_createdAt_idx" ON "AgentHandoffAuditEntry"("handoffId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentHandoffAuditEntry" ADD CONSTRAINT "AgentHandoffAuditEntry_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "AgentHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DonorEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'USD',
  "sourceSystem" VARCHAR(64) NOT NULL,
  "sourceRef" VARCHAR(512) NOT NULL,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DonorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DonorEvent_orgId_occurredAt_idx" ON "DonorEvent"("orgId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DonorEvent_orgId_sourceSystem_sourceRef_key" ON "DonorEvent"("orgId", "sourceSystem", "sourceRef");

-- AddForeignKey
ALTER TABLE "DonorEvent" ADD CONSTRAINT "DonorEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

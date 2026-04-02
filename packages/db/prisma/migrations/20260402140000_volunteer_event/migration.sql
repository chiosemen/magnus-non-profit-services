-- CreateTable
CREATE TABLE "VolunteerEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "hours" DECIMAL(10, 2) NOT NULL,
  "activityLabel" VARCHAR(256),
  "sourceSystem" VARCHAR(64) NOT NULL,
  "sourceRef" VARCHAR(512) NOT NULL,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VolunteerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolunteerEvent_orgId_occurredAt_idx" ON "VolunteerEvent"("orgId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerEvent_orgId_sourceSystem_sourceRef_key" ON "VolunteerEvent"("orgId", "sourceSystem", "sourceRef");

-- AddForeignKey
ALTER TABLE "VolunteerEvent" ADD CONSTRAINT "VolunteerEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

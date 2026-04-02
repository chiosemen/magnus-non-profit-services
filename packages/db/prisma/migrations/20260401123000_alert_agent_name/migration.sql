-- Add agentName attribution to alerts.
-- Backfill deterministically from dedupeKey prefix (format: "<agentName>:<scopeType>:...").

ALTER TABLE "Alert" ADD COLUMN "agentName" TEXT;

UPDATE "Alert"
SET "agentName" = split_part("dedupeKey", ':', 1)
WHERE "agentName" IS NULL;

ALTER TABLE "Alert" ALTER COLUMN "agentName" SET NOT NULL;

CREATE INDEX "Alert_agentName_idx" ON "Alert"("agentName");


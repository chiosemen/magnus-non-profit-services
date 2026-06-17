-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignStatus') THEN
        CREATE TYPE "CampaignStatus" AS ENUM (
            'DRAFT',
            'LIVE',
            'ARCHIVED'
        );
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" VARCHAR(256) NOT NULL,
    "slug" VARCHAR(256) NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "goalAmount" DECIMAL(14,2),
    "currency" VARCHAR(8) NOT NULL DEFAULT 'USD',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- Converge any earlier Campaign.name table to the canonical Campaign.title contract.
ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "title" VARCHAR(256),
ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Campaign'
          AND column_name = 'name'
    ) THEN
        EXECUTE 'UPDATE "Campaign" SET "title" = COALESCE("title", "name") WHERE "title" IS NULL';
        EXECUTE 'ALTER TABLE "Campaign" ALTER COLUMN "name" DROP NOT NULL';
    END IF;
END $$;

UPDATE "Campaign"
SET "title" = COALESCE("title", "slug", 'Untitled campaign')
WHERE "title" IS NULL;

ALTER TABLE "Campaign" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "goalAmount" TYPE DECIMAL(14,2);

-- Drop stale global slug constraints from the retired Campaign.name contract.
DROP INDEX IF EXISTS "Campaign_slug_key";
DROP INDEX IF EXISTS "Campaign_slug_idx";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_orgId_slug_key" ON "Campaign"("orgId", "slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_orgId_idx" ON "Campaign"("orgId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_orgId_status_idx" ON "Campaign"("orgId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_orgId_createdAt_idx" ON "Campaign"("orgId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Campaign_orgId_fkey'
          AND conrelid = '"Campaign"'::regclass
    ) THEN
        ALTER TABLE "Campaign"
        ADD CONSTRAINT "Campaign_orgId_fkey"
        FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

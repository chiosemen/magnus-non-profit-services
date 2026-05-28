-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM (
    'DRAFT',
    'LIVE',
    'ARCHIVED'
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_orgId_slug_key" ON "Campaign"("orgId", "slug");

-- CreateIndex
CREATE INDEX "Campaign_orgId_status_idx" ON "Campaign"("orgId", "status");

-- CreateIndex
CREATE INDEX "Campaign_orgId_createdAt_idx" ON "Campaign"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "Campaign"
ADD CONSTRAINT "Campaign_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

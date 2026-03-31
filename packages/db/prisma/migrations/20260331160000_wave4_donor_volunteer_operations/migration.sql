-- CreateEnum
CREATE TYPE "TimesheetEntryStatus" AS ENUM ('LOGGED', 'MISSING_REQUIRED_FIELDS');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "volunteerHourlyRateUsd" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "DonationCampaign" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationGift" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "donorKey" VARCHAR(128) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "giftDate" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" UUID,
    "sourceSystem" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonationGift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerProfile" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerAssignment" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "programLabel" VARCHAR(256) NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "volunteerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerTimeEntry" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "volunteerId" UUID NOT NULL,
    "programLabel" VARCHAR(256) NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "timesheetStatus" "TimesheetEntryStatus" NOT NULL DEFAULT 'LOGGED',
    "volunteerAssignmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerTimeEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DonationCampaign" ADD CONSTRAINT "DonationCampaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationGift" ADD CONSTRAINT "DonationGift_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationGift" ADD CONSTRAINT "DonationGift_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerProfile" ADD CONSTRAINT "VolunteerProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "VolunteerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerTimeEntry" ADD CONSTRAINT "VolunteerTimeEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerTimeEntry" ADD CONSTRAINT "VolunteerTimeEntry_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "VolunteerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerTimeEntry" ADD CONSTRAINT "VolunteerTimeEntry_volunteerAssignmentId_fkey" FOREIGN KEY ("volunteerAssignmentId") REFERENCES "VolunteerAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "DonationCampaign_orgId_idx" ON "DonationCampaign"("orgId");

-- CreateIndex
CREATE INDEX "DonationGift_orgId_giftDate_idx" ON "DonationGift"("orgId", "giftDate");

-- CreateIndex
CREATE INDEX "DonationGift_orgId_donorKey_idx" ON "DonationGift"("orgId", "donorKey");

-- CreateIndex
CREATE INDEX "DonationGift_campaignId_idx" ON "DonationGift"("campaignId");

-- CreateIndex
CREATE INDEX "VolunteerProfile_orgId_idx" ON "VolunteerProfile"("orgId");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_orgId_startAt_idx" ON "VolunteerAssignment"("orgId", "startAt");

-- CreateIndex
CREATE INDEX "VolunteerTimeEntry_orgId_occurredAt_idx" ON "VolunteerTimeEntry"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "VolunteerTimeEntry_volunteerId_idx" ON "VolunteerTimeEntry"("volunteerId");

-- CreateIndex
CREATE INDEX "VolunteerTimeEntry_volunteerAssignmentId_idx" ON "VolunteerTimeEntry"("volunteerAssignmentId");

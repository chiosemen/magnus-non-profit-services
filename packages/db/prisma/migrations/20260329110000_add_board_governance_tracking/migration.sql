-- CreateEnum
CREATE TYPE "GovernanceOfficerRole" AS ENUM ('CHAIR', 'VICE_CHAIR', 'TREASURER', 'SECRETARY', 'PRESIDENT', 'MEMBER_AT_LARGE', 'OTHER');

-- CreateTable
CREATE TABLE "GovernanceProfile" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "conflictOfInterestPolicy" BOOLEAN NOT NULL DEFAULT false,
    "whistleblowerPolicy" BOOLEAN NOT NULL DEFAULT false,
    "documentRetentionPolicy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardGovernanceMember" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "officerRole" "GovernanceOfficerRole",
    "termStart" TIMESTAMP(3),
    "termEnd" TIMESTAMP(3),
    "conflictDisclosureSignedAt" TIMESTAMP(3),
    "meetingsHeld" INTEGER,
    "meetingsAttended" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardGovernanceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceProfile_orgId_key" ON "GovernanceProfile"("orgId");

-- CreateIndex
CREATE INDEX "BoardGovernanceMember_orgId_termEnd_idx" ON "BoardGovernanceMember"("orgId", "termEnd");

-- CreateIndex
CREATE INDEX "BoardGovernanceMember_orgId_name_idx" ON "BoardGovernanceMember"("orgId", "name");

-- AddForeignKey
ALTER TABLE "GovernanceProfile" ADD CONSTRAINT "GovernanceProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardGovernanceMember" ADD CONSTRAINT "BoardGovernanceMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

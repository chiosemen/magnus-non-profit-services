-- CreateEnum
CREATE TYPE "StateRegistrationStatus" AS ENUM ('ACTIVE', 'PENDING', 'NOT_REGISTERED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "OrgStateRegistration" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "stateCode" CHAR(2) NOT NULL,
    "status" "StateRegistrationStatus" NOT NULL,
    "solicitsDonations" BOOLEAN NOT NULL DEFAULT true,
    "renewalDueDate" TIMESTAMP(3),
    "renewalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgStateRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgStateRegistration_orgId_stateCode_key" ON "OrgStateRegistration"("orgId", "stateCode");

-- CreateIndex
CREATE INDEX "OrgStateRegistration_orgId_renewalDueDate_idx" ON "OrgStateRegistration"("orgId", "renewalDueDate");

-- AddForeignKey
ALTER TABLE "OrgStateRegistration" ADD CONSTRAINT "OrgStateRegistration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

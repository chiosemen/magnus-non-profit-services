-- CreateEnum
CREATE TYPE "PartnerUserRole" AS ENUM ('PARTNER_ADMIN', 'PARTNER_VIEWER');

-- CreateTable
CREATE TABLE "InstitutionalPartner" (
    "id" UUID NOT NULL,
    "billingOrgId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionalPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerUser" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "PartnerUserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOrgMembership" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cohortLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOrgMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalPartner_slug_key" ON "InstitutionalPartner"("slug");

-- CreateIndex
CREATE INDEX "InstitutionalPartner_billingOrgId_idx" ON "InstitutionalPartner"("billingOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerUser_partnerId_userId_key" ON "PartnerUser"("partnerId", "userId");

-- CreateIndex
CREATE INDEX "PartnerUser_userId_idx" ON "PartnerUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrgMembership_partnerId_orgId_key" ON "PartnerOrgMembership"("partnerId", "orgId");

-- CreateIndex
CREATE INDEX "PartnerOrgMembership_partnerId_idx" ON "PartnerOrgMembership"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerOrgMembership_orgId_idx" ON "PartnerOrgMembership"("orgId");

-- AddForeignKey
ALTER TABLE "InstitutionalPartner" ADD CONSTRAINT "InstitutionalPartner_billingOrgId_fkey" FOREIGN KEY ("billingOrgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUser" ADD CONSTRAINT "PartnerUser_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "InstitutionalPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerUser" ADD CONSTRAINT "PartnerUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrgMembership" ADD CONSTRAINT "PartnerOrgMembership_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "InstitutionalPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrgMembership" ADD CONSTRAINT "PartnerOrgMembership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

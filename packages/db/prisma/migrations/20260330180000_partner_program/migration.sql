-- CreateTable
CREATE TABLE "PartnerProgram" (
    "id" UUID NOT NULL,
    "partnerId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "enabledFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProgram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerProgram_partnerId_idx" ON "PartnerProgram"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProgram_partnerId_slug_key" ON "PartnerProgram"("partnerId", "slug");

-- AddForeignKey
ALTER TABLE "PartnerProgram" ADD CONSTRAINT "PartnerProgram_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "InstitutionalPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PartnerOrgMembership" ADD COLUMN "programId" UUID;

-- CreateIndex
CREATE INDEX "PartnerOrgMembership_programId_idx" ON "PartnerOrgMembership"("programId");

-- AddForeignKey
ALTER TABLE "PartnerOrgMembership" ADD CONSTRAINT "PartnerOrgMembership_programId_fkey" FOREIGN KEY ("programId") REFERENCES "PartnerProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "PartnerOrgMembership" ADD COLUMN     "partnerNotes" TEXT,
ADD COLUMN     "partnerTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

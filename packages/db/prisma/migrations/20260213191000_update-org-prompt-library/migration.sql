-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('GRANT_DRAFT', 'BOARD_REPORT', 'DONOR_UPDATE', 'INTERNAL_MEMO');

-- DropForeignKey
ALTER TABLE "OrgClaudeConfig" DROP CONSTRAINT "OrgClaudeConfig_activePromptLibraryId_fkey";

-- AlterTable
ALTER TABLE "OrgClaudeConfig" DROP COLUMN "activePromptLibraryId";

-- Preserve prior prompt library table for audit/history (no delete).
ALTER TABLE "OrgPromptLibrary" RENAME TO "OrgPromptLibraryLegacy";

-- CreateTable
CREATE TABLE "OrgPromptLibrary" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "promptType" "PromptType" NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgPromptLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgPromptLibrary_orgId_promptType_version_key" ON "OrgPromptLibrary"("orgId", "promptType", "version");

-- CreateIndex
CREATE INDEX "OrgPromptLibrary_orgId_promptType_isActive_idx" ON "OrgPromptLibrary"("orgId", "promptType", "isActive");

-- CreateIndex
CREATE INDEX "OrgPromptLibrary_orgId_createdAt_idx" ON "OrgPromptLibrary"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgPromptLibrary" ADD CONSTRAINT "OrgPromptLibrary_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


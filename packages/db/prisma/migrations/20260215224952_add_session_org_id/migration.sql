-- AlterTable - Add orgId to Session (required, non-nullable)
-- NOTE: This migration requires all existing Session rows to have an orgId.
-- If there are existing rows, you may need to backfill before applying.
ALTER TABLE "Session" ADD COLUMN "orgId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

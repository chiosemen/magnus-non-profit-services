/*
  This migration previously re-created Session indexes that already exist in
  20260215202040_add_sessions, leading to “already exists” failures during
  clean deploys. The unique worker/org constraint, however, is still required.

  The Session-specific statements now use IF NOT EXISTS so replays remain
  idempotent, while the WorkerOrgRelationship constraint retains the original
  behavior (it is the authoritative definition).
*/
-- AlterTable
ALTER TABLE "Session" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_orgId_idx" ON "Session"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkerOrgRelationship_workerId_orgId_key" ON "WorkerOrgRelationship"("workerId", "orgId");

-- CreateEnum
CREATE TYPE "ClaudeStatus" AS ENUM ('NOT_ENABLED', 'CONFIGURING', 'ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "claudeStatus" "ClaudeStatus" NOT NULL DEFAULT 'NOT_ENABLED';


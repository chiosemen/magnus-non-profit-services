-- CreateEnum
CREATE TYPE "WorkerTier" AS ENUM ('FREE', 'PREMIUM');

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN "workerTier" "WorkerTier" NOT NULL DEFAULT 'FREE';


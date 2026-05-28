-- CreateEnum
CREATE TYPE "DonorType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "DonationSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOIDED');

-- CreateTable
CREATE TABLE "Donor" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "donorType" "DonorType" NOT NULL DEFAULT 'INDIVIDUAL',
    "name" VARCHAR(256) NOT NULL,
    "email" VARCHAR(256),
    "phone" VARCHAR(64),
    "addressJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonorNote" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "donorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonorNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "donorId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'USD',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" VARCHAR(64) NOT NULL,
    "referenceNumber" VARCHAR(128),
    "notes" TEXT,
    "source" "DonationSource" NOT NULL DEFAULT 'MANUAL',
    "importRowId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationReceipt" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "donationId" UUID NOT NULL,
    "receiptNumber" VARCHAR(64) NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationImportBatch" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "fileName" VARCHAR(256) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationImportRow" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "rawLineNumber" INTEGER NOT NULL,
    "rawContent" TEXT NOT NULL,
    "donorId" UUID,
    "status" VARCHAR(32) NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonationImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Donor_orgId_idx" ON "Donor"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Donor_orgId_email_key" ON "Donor"("orgId", "email");

-- CreateIndex
CREATE INDEX "DonorNote_orgId_idx" ON "DonorNote"("orgId");

-- CreateIndex
CREATE INDEX "DonorNote_donorId_idx" ON "DonorNote"("donorId");

-- CreateIndex
CREATE INDEX "Donation_orgId_receivedAt_idx" ON "Donation"("orgId", "receivedAt");

-- CreateIndex
CREATE INDEX "Donation_donorId_idx" ON "Donation"("donorId");

-- CreateIndex
CREATE UNIQUE INDEX "DonationReceipt_donationId_key" ON "DonationReceipt"("donationId");

-- CreateIndex
CREATE INDEX "DonationReceipt_orgId_idx" ON "DonationReceipt"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DonationReceipt_orgId_receiptNumber_key" ON "DonationReceipt"("orgId", "receiptNumber");

-- CreateIndex
CREATE INDEX "DonationImportBatch_orgId_idx" ON "DonationImportBatch"("orgId");

-- CreateIndex
CREATE INDEX "DonationImportRow_orgId_idx" ON "DonationImportRow"("orgId");

-- CreateIndex
CREATE INDEX "DonationImportRow_batchId_idx" ON "DonationImportRow"("batchId");

-- AddForeignKey
ALTER TABLE "Donor" ADD CONSTRAINT "Donor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorNote" ADD CONSTRAINT "DonorNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorNote" ADD CONSTRAINT "DonorNote_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "DonationImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationReceipt" ADD CONSTRAINT "DonationReceipt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationReceipt" ADD CONSTRAINT "DonationReceipt_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationImportBatch" ADD CONSTRAINT "DonationImportBatch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationImportRow" ADD CONSTRAINT "DonationImportRow_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationImportRow" ADD CONSTRAINT "DonationImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DonationImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationImportRow" ADD CONSTRAINT "DonationImportRow_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

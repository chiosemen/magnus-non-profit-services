-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ComplianceDeadlineType" AS ENUM ('FORM_990', 'STATE_REGISTRATION', 'GRANT_REPORT');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'FILED');

-- CreateEnum
CREATE TYPE "WorkerRelationshipType" AS ENUM ('W2_EMPLOYEE', 'CONTRACTOR_1099', 'BOARD_MEMBER');

-- CreateEnum
CREATE TYPE "WorkerTier" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('SALARY', 'CONSULTING', 'SPEAKING', 'ROYALTY');

-- CreateEnum
CREATE TYPE "TaxFormType" AS ENUM ('W2', 'NEC_1099', 'MISC_1099');

-- CreateEnum
CREATE TYPE "AgentScopeType" AS ENUM ('ORG', 'WORKER', 'GRANT');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('STARTED', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MED', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('GRANT_DRAFT', 'BOARD_REPORT', 'DONOR_UPDATE', 'INTERNAL_MEMO');

-- CreateEnum
CREATE TYPE "ClaudeStatus" AS ENUM ('NOT_ENABLED', 'CONFIGURING', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "ein" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualRevenue" DECIMAL(12,2),
    "fiscalYearEnd" TIMESTAMP(3),
    "subscriptionTier" "SubscriptionTier" NOT NULL,
    "claudeStatus" "ClaudeStatus" NOT NULL DEFAULT 'NOT_ENABLED',
    "plaidAccessToken" TEXT,
    "stripeAccountId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCalendar" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "deadlineType" "ComplianceDeadlineType" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ComplianceStatus" NOT NULL,
    "asanaTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grant" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "funderName" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "spentToDate" DECIMAL(12,2) NOT NULL,
    "reportingSchedule" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "workerTier" "WorkerTier" NOT NULL DEFAULT 'FREE',
    "ssnEncrypted" TEXT,
    "plaidAccessToken" TEXT,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerOrgRelationship" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "relationshipType" "WorkerRelationshipType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "annualCompensation" DECIMAL(12,2),
    "hoursPerWeek" INTEGER,
    "grantFunded" BOOLEAN NOT NULL,
    "grantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerOrgRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeTransaction" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "sourceOrgId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "incomeType" "IncomeType" NOT NULL,
    "taxForm" "TaxFormType" NOT NULL,
    "plaidTransactionId" TEXT,
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxEstimate" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "estimatedFederal" DECIMAL(12,2) NOT NULL,
    "estimatedState" DECIMAL(12,2) NOT NULL,
    "paidFederal" DECIMAL(12,2),
    "paidState" DECIMAL(12,2),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" UUID NOT NULL,
    "agentName" TEXT NOT NULL,
    "scopeType" "AgentScopeType" NOT NULL,
    "scopeId" UUID NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "status" "AgentRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "metrics" JSONB,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "scopeType" "AgentScopeType" NOT NULL,
    "scopeId" UUID NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recommendedActions" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgClaudeConfig" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultModel" TEXT NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "monthlyTokenCap" INTEGER NOT NULL DEFAULT 200000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgClaudeConfig_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "ClaudeUsageLog" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "workerId" UUID,
    "promptType" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "cost" DECIMAL(12,6) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaudeUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_ein_key" ON "Organization"("ein");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "ComplianceCalendar_orgId_dueDate_idx" ON "ComplianceCalendar"("orgId", "dueDate");

-- CreateIndex
CREATE INDEX "Grant_orgId_endDate_idx" ON "Grant"("orgId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_email_key" ON "Worker"("email");

-- CreateIndex
CREATE INDEX "IncomeTransaction_workerId_transactionDate_idx" ON "IncomeTransaction"("workerId", "transactionDate");

-- CreateIndex
CREATE INDEX "TaxEstimate_workerId_taxYear_quarter_idx" ON "TaxEstimate"("workerId", "taxYear", "quarter");

-- CreateIndex
CREATE INDEX "AgentRun_agentName_scopeType_scopeId_idx" ON "AgentRun"("agentName", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "AgentRun_windowEnd_idx" ON "AgentRun"("windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_agentName_scopeType_scopeId_windowStart_windowEnd_key" ON "AgentRun"("agentName", "scopeType", "scopeId", "windowStart", "windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_scopeType_scopeId_idx" ON "Alert"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgClaudeConfig_orgId_key" ON "OrgClaudeConfig"("orgId");

-- CreateIndex
CREATE INDEX "OrgPromptLibrary_orgId_promptType_isActive_idx" ON "OrgPromptLibrary"("orgId", "promptType", "isActive");

-- CreateIndex
CREATE INDEX "OrgPromptLibrary_orgId_createdAt_idx" ON "OrgPromptLibrary"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgPromptLibrary_orgId_promptType_version_key" ON "OrgPromptLibrary"("orgId", "promptType", "version");

-- CreateIndex
CREATE INDEX "ClaudeUsageLog_orgId_timestamp_idx" ON "ClaudeUsageLog"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "ClaudeUsageLog_orgId_promptType_timestamp_idx" ON "ClaudeUsageLog"("orgId", "promptType", "timestamp");

-- AddForeignKey
ALTER TABLE "ComplianceCalendar" ADD CONSTRAINT "ComplianceCalendar_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOrgRelationship" ADD CONSTRAINT "WorkerOrgRelationship_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOrgRelationship" ADD CONSTRAINT "WorkerOrgRelationship_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOrgRelationship" ADD CONSTRAINT "WorkerOrgRelationship_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_sourceOrgId_fkey" FOREIGN KEY ("sourceOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxEstimate" ADD CONSTRAINT "TaxEstimate_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgClaudeConfig" ADD CONSTRAINT "OrgClaudeConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPromptLibrary" ADD CONSTRAINT "OrgPromptLibrary_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaudeUsageLog" ADD CONSTRAINT "ClaudeUsageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaudeUsageLog" ADD CONSTRAINT "ClaudeUsageLog_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

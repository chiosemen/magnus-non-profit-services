-- CreateTable
CREATE TABLE "OrgPromptLibrary" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "prompts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPromptLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgClaudeConfig" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultModel" TEXT NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "activePromptLibraryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgClaudeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaudeUsageLog" (
    "id" UUID NOT NULL,
    "requestId" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaudeUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgClaudeConfig_orgId_key" ON "OrgClaudeConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgPromptLibrary_orgId_name_version_key" ON "OrgPromptLibrary"("orgId", "name", "version");

-- CreateIndex
CREATE INDEX "OrgPromptLibrary_orgId_createdAt_idx" ON "OrgPromptLibrary"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClaudeUsageLog_requestId_key" ON "ClaudeUsageLog"("requestId");

-- CreateIndex
CREATE INDEX "ClaudeUsageLog_orgId_createdAt_idx" ON "ClaudeUsageLog"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgPromptLibrary" ADD CONSTRAINT "OrgPromptLibrary_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgClaudeConfig" ADD CONSTRAINT "OrgClaudeConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgClaudeConfig" ADD CONSTRAINT "OrgClaudeConfig_activePromptLibraryId_fkey" FOREIGN KEY ("activePromptLibraryId") REFERENCES "OrgPromptLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaudeUsageLog" ADD CONSTRAINT "ClaudeUsageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


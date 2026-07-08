-- CreateEnum
CREATE TYPE "SyncDevicePlatform" AS ENUM ('linux', 'macos', 'windows');

-- CreateEnum
CREATE TYPE "UsageRecordState" AS ENUM ('active', 'missing', 'removed');

-- CreateEnum
CREATE TYPE "UsageCostStatus" AS ENUM ('available', 'estimated', 'not_applicable', 'unavailable');

-- CreateEnum
CREATE TYPE "UsageCostKind" AS ENUM ('source_reported', 'collector_calculated', 'collector_mixed', 'burnly_calculated', 'unknown');

-- CreateEnum
CREATE TYPE "UsageDataQuality" AS ENUM ('complete', 'partial');

-- CreateEnum
CREATE TYPE "SyncBatchScope" AS ENUM ('rolling');

-- CreateEnum
CREATE TYPE "SyncBatchStatus" AS ENUM ('accepted', 'rejected');

-- CreateTable
CREATE TABLE "SyncDevice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "clientDeviceId" VARCHAR(128) NOT NULL,
    "displayName" VARCHAR(128),
    "platform" "SyncDevicePlatform" NOT NULL,
    "appVersion" VARCHAR(64) NOT NULL,
    "reportingTimezone" VARCHAR(64) NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastClientRevision" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUsageFact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "sourceKey" VARCHAR(64) NOT NULL,
    "identityKey" VARCHAR(512) NOT NULL,
    "identityVersion" INTEGER NOT NULL,
    "usageDate" DATE NOT NULL,
    "aggregationTimezone" VARCHAR(64) NOT NULL,
    "inputTokens" BIGINT,
    "outputTokens" BIGINT,
    "cacheCreationTokens" BIGINT,
    "cacheReadTokens" BIGINT,
    "totalTokens" BIGINT NOT NULL,
    "unclassifiedTokens" BIGINT,
    "costStatus" "UsageCostStatus" NOT NULL,
    "costKind" "UsageCostKind" NOT NULL,
    "costAmountMicros" BIGINT,
    "costCurrency" CHAR(3),
    "dataQuality" "UsageDataQuality" NOT NULL,
    "recordState" "UsageRecordState" NOT NULL,
    "clientFirstSeenAt" TIMESTAMP(3) NOT NULL,
    "clientLastSeenAt" TIMESTAMP(3) NOT NULL,
    "clientRemovedAt" TIMESTAMP(3),
    "clientRevision" BIGINT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyUsageFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyModelUsageFact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "dailyUsageFactId" UUID NOT NULL,
    "rawModelId" VARCHAR(256),
    "modelIdentityKey" VARCHAR(256) NOT NULL,
    "displayName" VARCHAR(256),
    "providerKey" VARCHAR(64),
    "inputTokens" BIGINT,
    "outputTokens" BIGINT,
    "cacheCreationTokens" BIGINT,
    "cacheReadTokens" BIGINT,
    "totalTokens" BIGINT,
    "costStatus" "UsageCostStatus" NOT NULL,
    "costKind" "UsageCostKind",
    "costAmountMicros" BIGINT,
    "costCurrency" CHAR(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyModelUsageFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "deviceId" UUID,
    "clientBatchId" VARCHAR(128),
    "contractVersion" INTEGER,
    "clientRevision" BIGINT,
    "appVersion" VARCHAR(64),
    "windowStartDate" DATE,
    "windowEndDate" DATE,
    "windowScope" "SyncBatchScope",
    "status" "SyncBatchStatus" NOT NULL,
    "recordsReceived" INTEGER NOT NULL DEFAULT 0,
    "recordsUpserted" INTEGER NOT NULL DEFAULT 0,
    "recordsRemoved" INTEGER NOT NULL DEFAULT 0,
    "recordsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "rejectCode" VARCHAR(128),
    "traceId" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncDevice_userId_idx" ON "SyncDevice"("userId");

-- CreateIndex
CREATE INDEX "SyncDevice_userId_lastSyncAt_idx" ON "SyncDevice"("userId", "lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncDevice_userId_clientDeviceId_key" ON "SyncDevice"("userId", "clientDeviceId");

-- CreateIndex
CREATE INDEX "DailyUsageFact_userId_usageDate_idx" ON "DailyUsageFact"("userId", "usageDate");

-- CreateIndex
CREATE INDEX "DailyUsageFact_userId_sourceKey_usageDate_idx" ON "DailyUsageFact"("userId", "sourceKey", "usageDate");

-- CreateIndex
CREATE INDEX "DailyUsageFact_userId_aggregationTimezone_usageDate_idx" ON "DailyUsageFact"("userId", "aggregationTimezone", "usageDate");

-- CreateIndex
CREATE INDEX "DailyUsageFact_deviceId_usageDate_idx" ON "DailyUsageFact"("deviceId", "usageDate");

-- CreateIndex
CREATE INDEX "DailyUsageFact_userId_recordState_usageDate_idx" ON "DailyUsageFact"("userId", "recordState", "usageDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUsageFact_userId_deviceId_identityKey_key" ON "DailyUsageFact"("userId", "deviceId", "identityKey");

-- CreateIndex
CREATE INDEX "DailyModelUsageFact_userId_idx" ON "DailyModelUsageFact"("userId");

-- CreateIndex
CREATE INDEX "DailyModelUsageFact_dailyUsageFactId_idx" ON "DailyModelUsageFact"("dailyUsageFactId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyModelUsageFact_dailyUsageFactId_modelIdentityKey_key" ON "DailyModelUsageFact"("dailyUsageFactId", "modelIdentityKey");

-- CreateIndex
CREATE INDEX "SyncBatch_userId_createdAt_idx" ON "SyncBatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncBatch_deviceId_createdAt_idx" ON "SyncBatch"("deviceId", "createdAt");

-- AddForeignKey
ALTER TABLE "SyncDevice" ADD CONSTRAINT "SyncDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyUsageFact" ADD CONSTRAINT "DailyUsageFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyUsageFact" ADD CONSTRAINT "DailyUsageFact_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyModelUsageFact" ADD CONSTRAINT "DailyModelUsageFact_dailyUsageFactId_fkey" FOREIGN KEY ("dailyUsageFactId") REFERENCES "DailyUsageFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncBatch" ADD CONSTRAINT "SyncBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncBatch" ADD CONSTRAINT "SyncBatch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

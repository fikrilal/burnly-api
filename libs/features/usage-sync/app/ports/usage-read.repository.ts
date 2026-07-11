import type {
  SyncDevicePlatform,
  UsageCostKind,
  UsageCostStatus,
  UsageDataQuality,
  UsageRecordState,
} from '../usage-sync.types';

/**
 * Shared filter for usage read queries.
 * Dates are calendar dates as UTC-midnight Date (via usageDateToUtcDate).
 * deviceId is the internal SyncDevice UUID when a client device filter is applied.
 */
export type UsageReadScope = Readonly<{
  userId: string;
  aggregationTimezone: string;
  /** Internal SyncDevice.id when filtering to one install. */
  deviceId?: string;
}>;

export type ParentTotalsResult = Readonly<{
  totalTokens: bigint;
  factCount: number;
  /** Sum of non-null values; null when no non-null contributions. */
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  cacheCreationTokens: bigint | null;
  cacheReadTokens: bigint | null;
}>;

export type ParentTotalsByDateRow = Readonly<{
  usageDate: string;
  totalTokens: bigint;
  factCount: number;
}>;

export type UsageReadDeviceFields = Readonly<{
  clientDeviceId: string;
  displayName: string | null;
  platform: SyncDevicePlatform;
}>;

export type UsageReadParentFact = Readonly<{
  id: string;
  identityKey: string;
  identityVersion: number;
  sourceKey: string;
  usageDate: string;
  aggregationTimezone: string;
  device: UsageReadDeviceFields;
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  cacheCreationTokens: bigint | null;
  cacheReadTokens: bigint | null;
  totalTokens: bigint;
  unclassifiedTokens: bigint | null;
  costStatus: UsageCostStatus;
  costKind: UsageCostKind;
  costAmountMicros: bigint | null;
  costCurrency: string | null;
  dataQuality: UsageDataQuality;
  recordState: UsageRecordState;
  clientLastSeenAt: Date;
  clientRevision: bigint;
  syncedAt: Date;
}>;

export type UsageReadModelFact = Readonly<{
  id: string;
  dailyUsageFactId: string;
  modelIdentityKey: string;
  rawModelId: string | null;
  displayName: string | null;
  providerKey: string | null;
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  cacheCreationTokens: bigint | null;
  cacheReadTokens: bigint | null;
  totalTokens: bigint | null;
  costStatus: UsageCostStatus;
  costKind: UsageCostKind | null;
  costAmountMicros: bigint | null;
  costCurrency: string | null;
}>;

export type AggregatedModelRow = Readonly<{
  modelIdentityKey: string;
  rawModelId: string | null;
  displayName: string | null;
  providerKey: string | null;
  totalTokens: bigint;
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  cacheCreationTokens: bigint | null;
  cacheReadTokens: bigint | null;
}>;

/**
 * Read-only queries for Phase 2 usage/sync reporting.
 * All fact queries default to recordState = active.
 */
export interface UsageReadRepository {
  sumParentTotals(
    scope: UsageReadScope,
    fromDate: Date,
    toDate: Date,
    sourceKey?: string,
  ): Promise<ParentTotalsResult>;

  groupParentTotalsByDate(
    scope: UsageReadScope,
    fromDate: Date,
    toDate: Date,
  ): Promise<readonly ParentTotalsByDateRow[]>;

  listActiveParentsForDay(
    scope: UsageReadScope,
    usageDate: Date,
  ): Promise<readonly UsageReadParentFact[]>;

  listModelsForFactIds(
    userId: string,
    factIds: readonly string[],
  ): Promise<readonly UsageReadModelFact[]>;

  aggregateModelsByIdentity(
    scope: UsageReadScope,
    fromDate: Date,
    toDate: Date,
    sourceKey?: string,
  ): Promise<readonly AggregatedModelRow[]>;

  maxDeviceLastSyncAt(userId: string, deviceId?: string): Promise<Date | null>;
}

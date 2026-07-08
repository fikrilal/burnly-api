export type SyncDevicePlatform = 'linux' | 'macos' | 'windows';

export type UsageRecordState = 'active' | 'missing' | 'removed';

export type UsageCostStatus = 'available' | 'estimated' | 'not_applicable' | 'unavailable';

export type UsageCostKind =
  | 'source_reported'
  | 'collector_calculated'
  | 'collector_mixed'
  | 'burnly_calculated'
  | 'unknown';

export type UsageDataQuality = 'complete' | 'partial';

export type SyncBatchScope = 'rolling';

export type SyncBatchStatus = 'accepted' | 'rejected';

export type SyncDeviceRecord = Readonly<{
  id: string;
  userId: string;
  clientDeviceId: string;
  displayName: string | null;
  platform: SyncDevicePlatform;
  appVersion: string;
  reportingTimezone: string;
  lastSyncAt: Date | null;
  lastClientRevision: bigint | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type UpsertSyncDeviceInput = Readonly<{
  userId: string;
  clientDeviceId: string;
  displayName?: string | null;
  platform: SyncDevicePlatform;
  appVersion: string;
  reportingTimezone: string;
}>;

export type DailyModelUsageWrite = Readonly<{
  rawModelId?: string | null;
  displayName?: string | null;
  providerKey?: string | null;
  inputTokens?: bigint | null;
  outputTokens?: bigint | null;
  cacheCreationTokens?: bigint | null;
  cacheReadTokens?: bigint | null;
  totalTokens?: bigint | null;
  costStatus: UsageCostStatus;
  costKind?: UsageCostKind | null;
  costAmountMicros?: bigint | null;
  costCurrency?: string | null;
}>;

export type UpsertDailyUsageFactInput = Readonly<{
  userId: string;
  deviceId: string;
  sourceKey: string;
  identityKey: string;
  identityVersion: number;
  usageDate: Date;
  aggregationTimezone: string;
  inputTokens?: bigint | null;
  outputTokens?: bigint | null;
  cacheCreationTokens?: bigint | null;
  cacheReadTokens?: bigint | null;
  totalTokens: bigint;
  unclassifiedTokens?: bigint | null;
  costStatus: UsageCostStatus;
  costKind: UsageCostKind;
  costAmountMicros?: bigint | null;
  costCurrency?: string | null;
  dataQuality: UsageDataQuality;
  recordState: UsageRecordState;
  clientFirstSeenAt: Date;
  clientLastSeenAt: Date;
  clientRemovedAt?: Date | null;
  clientRevision: bigint;
  syncedAt: Date;
  models: readonly DailyModelUsageWrite[];
}>;

export type UpsertDailyUsageFactResult = Readonly<{
  factId: string;
  outcome: 'created' | 'updated' | 'unchanged' | 'ignored_stale';
  modelCount: number;
}>;

export type CreateSyncBatchInput = Readonly<{
  userId: string;
  deviceId?: string | null;
  clientBatchId?: string | null;
  contractVersion?: number | null;
  clientRevision?: bigint | null;
  appVersion?: string | null;
  windowStartDate?: Date | null;
  windowEndDate?: Date | null;
  windowScope?: SyncBatchScope | null;
  status: SyncBatchStatus;
  recordsReceived?: number;
  recordsUpserted?: number;
  recordsRemoved?: number;
  recordsUnchanged?: number;
  rejectCode?: string | null;
  traceId?: string | null;
}>;

export type SyncBatchRecord = Readonly<{
  id: string;
  userId: string;
  deviceId: string | null;
  status: SyncBatchStatus;
  createdAt: Date;
}>;

import type {
  UpsertDailyUsageFactInput,
  UpsertDailyUsageFactResult,
  UsageRecordState,
} from '../usage-sync.types';

export type CommitDailyUsagePushInput = Readonly<{
  deviceId: string;
  syncedAt: Date;
  clientRevision: bigint;
  appVersion: string;
  reportingTimezone: string;
  facts: readonly UpsertDailyUsageFactInput[];
  /** Parallel to facts — used for response/audit count mapping after upsert outcomes. */
  factRecordStates: readonly UsageRecordState[];
  batch: Readonly<{
    userId: string;
    clientBatchId?: string | null;
    contractVersion: number;
    appVersion: string;
    windowStartDate: Date;
    windowEndDate: Date;
    traceId?: string | null;
  }>;
}>;

export type CommitDailyUsagePushResult = Readonly<{
  factResults: readonly UpsertDailyUsageFactResult[];
  counts: Readonly<{
    received: number;
    upserted: number;
    removed: number;
    unchanged: number;
    rejected: number;
  }>;
}>;

export interface DailyUsageFactsRepository {
  /**
   * Upsert a parent fact by (userId, deviceId, identityKey) and replace model children.
   * Stale revisions (lower clientRevision, or equal revision with older lastSeenAt) are ignored.
   */
  upsertFactWithModels(input: UpsertDailyUsageFactInput): Promise<UpsertDailyUsageFactResult>;

  /**
   * Transactional push: upsert all facts, mark device last sync, write accepted batch audit.
   */
  commitDailyUsagePush(input: CommitDailyUsagePushInput): Promise<CommitDailyUsagePushResult>;
}

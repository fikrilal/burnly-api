import type { UpsertDailyUsageFactInput, UpsertDailyUsageFactResult } from '../usage-sync.types';

export interface DailyUsageFactsRepository {
  /**
   * Upsert a parent fact by (userId, deviceId, identityKey) and replace model children.
   * Stale revisions (lower clientRevision, or equal revision with older lastSeenAt) are ignored.
   */
  upsertFactWithModels(input: UpsertDailyUsageFactInput): Promise<UpsertDailyUsageFactResult>;
}

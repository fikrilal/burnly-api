import type { CreateSyncBatchInput, SyncBatchRecord } from '../usage-sync.types';

export interface SyncBatchesRepository {
  create(input: CreateSyncBatchInput): Promise<SyncBatchRecord>;
}
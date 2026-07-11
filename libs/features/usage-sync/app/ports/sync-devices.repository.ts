import type { SyncDeviceRecord, UpsertSyncDeviceInput } from '../usage-sync.types';

export interface SyncDevicesRepository {
  upsertByClientDeviceId(input: UpsertSyncDeviceInput): Promise<SyncDeviceRecord>;

  findByUserAndClientDeviceId(
    userId: string,
    clientDeviceId: string,
  ): Promise<SyncDeviceRecord | null>;

  /**
   * All devices for a user.
   * Order: lastSyncAt DESC NULLS LAST, then createdAt DESC.
   */
  listByUser(userId: string): Promise<readonly SyncDeviceRecord[]>;

  markSyncSuccess(input: {
    deviceId: string;
    syncedAt: Date;
    clientRevision: bigint;
  }): Promise<void>;
}

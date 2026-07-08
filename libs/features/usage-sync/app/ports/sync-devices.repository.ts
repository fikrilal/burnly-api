import type { SyncDeviceRecord, UpsertSyncDeviceInput } from '../usage-sync.types';

export interface SyncDevicesRepository {
  upsertByClientDeviceId(input: UpsertSyncDeviceInput): Promise<SyncDeviceRecord>;

  findByUserAndClientDeviceId(
    userId: string,
    clientDeviceId: string,
  ): Promise<SyncDeviceRecord | null>;

  markSyncSuccess(input: {
    deviceId: string;
    syncedAt: Date;
    clientRevision: bigint;
  }): Promise<void>;
}

import { SyncErrorCode } from './usage-sync.error-codes';
import { UsageSyncError } from './usage-sync.errors';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import type { SyncDevicePlatform, SyncDeviceRecord } from './usage-sync.types';

export type SyncDeviceView = Readonly<{
  clientDeviceId: string;
  displayName: string | null;
  platform: SyncDevicePlatform;
  appVersion: string;
  reportingTimezone: string;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type UpsertSyncDeviceCommand = Readonly<{
  userId: string;
  clientDeviceId: string;
  displayName?: string | null;
  platform: SyncDevicePlatform;
  appVersion: string;
  reportingTimezone: string;
}>;

function toIso(value: Date): string {
  return value.toISOString();
}

function toView(record: SyncDeviceRecord): SyncDeviceView {
  return {
    clientDeviceId: record.clientDeviceId,
    displayName: record.displayName,
    platform: record.platform,
    appVersion: record.appVersion,
    reportingTimezone: record.reportingTimezone,
    lastSyncAt: record.lastSyncAt ? toIso(record.lastSyncAt) : null,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

export class SyncDevicesService {
  constructor(private readonly devices: SyncDevicesRepository) {}

  async upsertDevice(command: UpsertSyncDeviceCommand): Promise<SyncDeviceView> {
    const record = await this.devices.upsertByClientDeviceId({
      userId: command.userId,
      clientDeviceId: command.clientDeviceId,
      displayName: command.displayName,
      platform: command.platform,
      appVersion: command.appVersion,
      reportingTimezone: command.reportingTimezone,
    });
    return toView(record);
  }

  async getDevice(userId: string, clientDeviceId: string): Promise<SyncDeviceView> {
    const record = await this.devices.findByUserAndClientDeviceId(userId, clientDeviceId);
    if (!record) {
      throw new UsageSyncError({
        status: 404,
        code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
        message: 'Sync device not found',
      });
    }
    return toView(record);
  }
}

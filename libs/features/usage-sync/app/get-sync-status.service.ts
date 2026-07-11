import { nullableBigintToJsonNumber } from './json-bigint';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import type { SyncDevicePlatform, SyncDeviceRecord } from './usage-sync.types';

export type SyncStatusDeviceJson = Readonly<{
  clientDeviceId: string;
  displayName: string | null;
  platform: SyncDevicePlatform;
  appVersion: string;
  reportingTimezone: string;
  lastSyncAt: string | null;
  lastClientRevision: number | string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type SyncStatusView = Readonly<{
  lastSyncAt: string | null;
  deviceCount: number;
  devices: readonly SyncStatusDeviceJson[];
}>;

function toDeviceJson(record: SyncDeviceRecord): SyncStatusDeviceJson {
  return {
    clientDeviceId: record.clientDeviceId,
    displayName: record.displayName,
    platform: record.platform,
    appVersion: record.appVersion,
    reportingTimezone: record.reportingTimezone,
    lastSyncAt: record.lastSyncAt ? record.lastSyncAt.toISOString() : null,
    lastClientRevision: nullableBigintToJsonNumber(record.lastClientRevision),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Account-level lastSyncAt = max of device lastSyncAt (null if none). */
export function maxLastSyncAt(devices: readonly SyncDeviceRecord[]): Date | null {
  let max: Date | null = null;
  for (const device of devices) {
    if (!device.lastSyncAt) continue;
    if (max === null || device.lastSyncAt.getTime() > max.getTime()) {
      max = device.lastSyncAt;
    }
  }
  return max;
}

export class GetSyncStatusService {
  constructor(private readonly devices: SyncDevicesRepository) {}

  async execute(userId: string): Promise<SyncStatusView> {
    const records = await this.devices.listByUser(userId);
    const lastSync = maxLastSyncAt(records);

    return {
      lastSyncAt: lastSync ? lastSync.toISOString() : null,
      deviceCount: records.length,
      devices: records.map(toDeviceJson),
    };
  }
}

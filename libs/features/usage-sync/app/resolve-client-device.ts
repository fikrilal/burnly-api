import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { SyncErrorCode } from './usage-sync.error-codes';
import { UsageSyncError } from './usage-sync.errors';

/**
 * Resolve optional public clientDeviceId (query `deviceId`) to internal SyncDevice.id.
 * Missing/blank filter → undefined (no device constraint).
 * Present but not owned by user → SYNC_DEVICE_NOT_FOUND.
 */
export async function resolveOptionalClientDeviceId(input: {
  userId: string;
  clientDeviceId: string | undefined;
  devices: SyncDevicesRepository;
}): Promise<string | undefined> {
  const raw = input.clientDeviceId;
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  const device = await input.devices.findByUserAndClientDeviceId(input.userId, trimmed);
  if (!device) {
    throw new UsageSyncError({
      status: 404,
      code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
      message: 'Sync device not found',
    });
  }

  return device.id;
}

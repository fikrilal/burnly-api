import { resolveOptionalClientDeviceId } from './resolve-client-device';
import { SyncErrorCode } from './usage-sync.error-codes';
import { UsageSyncError } from './usage-sync.errors';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import type { SyncDeviceRecord } from './usage-sync.types';

function deviceRecord(overrides: Partial<SyncDeviceRecord> = {}): SyncDeviceRecord {
  return {
    id: 'server-uuid-1',
    userId: 'user-1',
    clientDeviceId: 'dev-1',
    displayName: 'laptop',
    platform: 'linux',
    appVersion: '0.1.20',
    reportingTimezone: 'UTC',
    lastSyncAt: null,
    lastClientRevision: null,
    createdAt: new Date('2026-07-09T10:00:00.000Z'),
    updatedAt: new Date('2026-07-09T10:00:00.000Z'),
    ...overrides,
  };
}

describe('resolveOptionalClientDeviceId', () => {
  it('returns undefined when filter is omitted or blank', async () => {
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    await expect(
      resolveOptionalClientDeviceId({
        userId: 'user-1',
        clientDeviceId: undefined,
        devices,
      }),
    ).resolves.toBeUndefined();

    await expect(
      resolveOptionalClientDeviceId({
        userId: 'user-1',
        clientDeviceId: '   ',
        devices,
      }),
    ).resolves.toBeUndefined();

    expect(devices.findByUserAndClientDeviceId).not.toHaveBeenCalled();
  });

  it('returns internal device id when found', async () => {
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => deviceRecord()),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    await expect(
      resolveOptionalClientDeviceId({
        userId: 'user-1',
        clientDeviceId: 'dev-1',
        devices,
      }),
    ).resolves.toBe('server-uuid-1');

    expect(devices.findByUserAndClientDeviceId).toHaveBeenCalledWith('user-1', 'dev-1');
  });

  it('throws SYNC_DEVICE_NOT_FOUND when missing', async () => {
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => null),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    await expect(
      resolveOptionalClientDeviceId({
        userId: 'user-1',
        clientDeviceId: 'missing',
        devices,
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    });

    await expect(
      resolveOptionalClientDeviceId({
        userId: 'user-1',
        clientDeviceId: 'missing',
        devices,
      }),
    ).rejects.toBeInstanceOf(UsageSyncError);
  });
});

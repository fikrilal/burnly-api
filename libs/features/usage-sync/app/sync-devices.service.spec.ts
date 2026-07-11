import { SyncDevicesService } from './sync-devices.service';
import { SyncErrorCode } from './usage-sync.error-codes';
import { UsageSyncError } from './usage-sync.errors';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import type { SyncDeviceRecord } from './usage-sync.types';

function deviceRecord(overrides: Partial<SyncDeviceRecord> = {}): SyncDeviceRecord {
  return {
    id: 'server-id',
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

describe('SyncDevicesService', () => {
  it('upserts and maps ISO timestamps', async () => {
    const repo: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(async () => deviceRecord()),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new SyncDevicesService(repo);
    const view = await service.upsertDevice({
      userId: 'user-1',
      clientDeviceId: 'dev-1',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
      displayName: 'laptop',
    });

    expect(repo.upsertByClientDeviceId).toHaveBeenCalledWith({
      userId: 'user-1',
      clientDeviceId: 'dev-1',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
      displayName: 'laptop',
    });
    expect(view).toEqual({
      clientDeviceId: 'dev-1',
      displayName: 'laptop',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
      lastSyncAt: null,
      createdAt: '2026-07-09T10:00:00.000Z',
      updatedAt: '2026-07-09T10:00:00.000Z',
    });
  });

  it('throws SYNC_DEVICE_NOT_FOUND when missing', async () => {
    const repo: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => null),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new SyncDevicesService(repo);
    await expect(service.getDevice('user-1', 'missing')).rejects.toMatchObject({
      status: 404,
      code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    });
    await expect(service.getDevice('user-1', 'missing')).rejects.toBeInstanceOf(UsageSyncError);
  });
});

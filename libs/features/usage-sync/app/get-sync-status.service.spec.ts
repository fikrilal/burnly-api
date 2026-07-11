import { GetSyncStatusService, maxLastSyncAt } from './get-sync-status.service';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import type { SyncDeviceRecord } from './usage-sync.types';

function device(overrides: Partial<SyncDeviceRecord> = {}): SyncDeviceRecord {
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
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('maxLastSyncAt', () => {
  it('returns null when no devices or all null lastSyncAt', () => {
    expect(maxLastSyncAt([])).toBeNull();
    expect(maxLastSyncAt([device(), device({ clientDeviceId: 'dev-2' })])).toBeNull();
  });

  it('returns the latest lastSyncAt', () => {
    const older = device({
      lastSyncAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    const newer = device({
      clientDeviceId: 'dev-2',
      lastSyncAt: new Date('2026-07-15T03:55:00.000Z'),
    });
    expect(maxLastSyncAt([older, newer])?.toISOString()).toBe('2026-07-15T03:55:00.000Z');
  });
});

describe('GetSyncStatusService', () => {
  it('returns empty inventory', async () => {
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(async () => []),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetSyncStatusService(devices);
    await expect(service.execute('user-1')).resolves.toEqual({
      lastSyncAt: null,
      deviceCount: 0,
      devices: [],
    });
  });

  it('maps devices without server UUIDs and computes account lastSyncAt', async () => {
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(async () => [
        device({
          id: 'uuid-new',
          clientDeviceId: 'dev_abc',
          displayName: 'fikri-laptop',
          lastSyncAt: new Date('2026-07-15T03:55:00.000Z'),
          lastClientRevision: 42n,
          updatedAt: new Date('2026-07-15T03:55:00.000Z'),
        }),
        device({
          id: 'uuid-old',
          clientDeviceId: 'dev_xyz',
          displayName: 'studio-mac',
          platform: 'macos',
          appVersion: '0.1.18',
          reportingTimezone: 'America/Los_Angeles',
          lastSyncAt: null,
          lastClientRevision: null,
          createdAt: new Date('2026-07-10T08:00:00.000Z'),
          updatedAt: new Date('2026-07-10T08:00:00.000Z'),
        }),
      ]),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetSyncStatusService(devices);
    const view = await service.execute('user-1');

    expect(view.lastSyncAt).toBe('2026-07-15T03:55:00.000Z');
    expect(view.deviceCount).toBe(2);
    expect(view.devices[0]).toEqual({
      clientDeviceId: 'dev_abc',
      displayName: 'fikri-laptop',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
      lastSyncAt: '2026-07-15T03:55:00.000Z',
      lastClientRevision: 42,
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-15T03:55:00.000Z',
    });
    expect(view.devices[1]?.lastSyncAt).toBeNull();
    expect(view.devices[1]?.lastClientRevision).toBeNull();
    expect(JSON.stringify(view)).not.toContain('uuid-');
    expect(devices.listByUser).toHaveBeenCalledWith('user-1');
  });
});

import { GetUsageCalendarService } from './get-usage-calendar.service';
import type { UsageReadRepository } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { SyncErrorCode } from './usage-sync.error-codes';
import type { SyncDeviceRecord } from './usage-sync.types';
import { stubSyncDevicesRepository, stubUsageReadRepository } from './usage-read-test-doubles';

function deviceRecord(overrides: Partial<SyncDeviceRecord> = {}): SyncDeviceRecord {
  return {
    id: 'device-uuid',
    userId: 'user-1',
    clientDeviceId: 'dev-1',
    displayName: 'laptop',
    platform: 'linux',
    appVersion: '0.1.20',
    reportingTimezone: 'UTC',
    lastSyncAt: null,
    lastClientRevision: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('GetUsageCalendarService', () => {
  it('returns dense days with zeros for gaps', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(async () => [
        { usageDate: '2026-07-02', totalTokens: 2100n, factCount: 2 },
      ]),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageCalendarService(reads, devices);
    const result = await service.execute({
      userId: 'user-1',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-03',
    });

    expect(result.meta.dayCount).toBe(3);
    expect(result.data).toMatchObject({
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-03',
      deviceFilter: null,
    });
    expect(result.data.days).toEqual([
      { date: '2026-07-01', totalTokens: 0, factCount: 0, active: false },
      { date: '2026-07-02', totalTokens: 2100, factCount: 2, active: true },
      { date: '2026-07-03', totalTokens: 0, factCount: 0, active: false },
    ]);

    expect(reads.groupParentTotalsByDate).toHaveBeenCalledWith(
      { userId: 'user-1', aggregationTimezone: 'UTC' },
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-07-03T00:00:00.000Z'),
    );
  });

  it('rejects invalid range and timezone', async () => {
    const reads = stubUsageReadRepository();
    const devices = stubSyncDevicesRepository();
    const service = new GetUsageCalendarService(reads, devices);

    await expect(
      service.execute({
        userId: 'user-1',
        timezone: 'Not/A_Zone',
        from: '2026-07-01',
        to: '2026-07-02',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });

    await expect(
      service.execute({
        userId: 'user-1',
        timezone: 'UTC',
        from: '2026-07-09',
        to: '2026-07-01',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });

    // 367 days inclusive
    await expect(
      service.execute({
        userId: 'user-1',
        timezone: 'UTC',
        from: '2024-01-01',
        to: '2025-01-01',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('resolves device filter and throws when missing', async () => {
    const reads = stubUsageReadRepository();
    const devices = stubSyncDevicesRepository({
      findByUserAndClientDeviceId: jest.fn(async () => null),
    });
    const service = new GetUsageCalendarService(reads, devices);

    await expect(
      service.execute({
        userId: 'user-1',
        timezone: 'UTC',
        from: '2026-07-01',
        to: '2026-07-01',
        deviceId: 'missing',
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    });
  });

  it('passes resolved internal device id to repository', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(async () => []),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => deviceRecord()),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageCalendarService(reads, devices);
    const result = await service.execute({
      userId: 'user-1',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-01',
      deviceId: 'dev-1',
    });

    expect(result.data.deviceFilter).toBe('dev-1');
    expect(reads.groupParentTotalsByDate).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-uuid' }),
      expect.any(Date),
      expect.any(Date),
    );
  });
});

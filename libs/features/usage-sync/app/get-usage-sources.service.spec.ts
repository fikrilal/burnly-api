import { GetUsageSourcesService } from './get-usage-sources.service';
import type { UsageReadRepository } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { SyncErrorCode } from './usage-sync.error-codes';
import type { SyncDeviceRecord } from './usage-sync.types';
import { stubSyncDevicesRepository, stubUsageReadRepository } from './usage-read-test-doubles';

function deviceRecord(): SyncDeviceRecord {
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
  };
}

describe('GetUsageSourcesService', () => {
  it('returns parentTotals and sources sorted by tokens', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(async () => ({
        totalTokens: 100000n,
        factCount: 40,
        inputTokens: null,
        outputTokens: null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
      })),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(async () => [
        { sourceKey: 'claude-code', totalTokens: 70000n, factCount: 20 },
        { sourceKey: 'codex', totalTokens: 30000n, factCount: 12 },
      ]),
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

    const service = new GetUsageSourcesService(reads, devices);
    const result = await service.execute({
      userId: 'user-1',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-09',
    });

    expect(result.meta.sourceCount).toBe(2);
    expect(result.data.parentTotals).toEqual({ totalTokens: 100000, factCount: 40 });
    expect(result.data.sources).toEqual([
      { sourceKey: 'claude-code', totalTokens: 70000, factCount: 20 },
      { sourceKey: 'codex', totalTokens: 30000, factCount: 12 },
    ]);
    expect(result.data.deviceFilter).toBeNull();
  });

  it('passes device filter to repository', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(async () => ({
        totalTokens: 0n,
        factCount: 0,
        inputTokens: null,
        outputTokens: null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
      })),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(async () => []),
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

    const service = new GetUsageSourcesService(reads, devices);
    await service.execute({
      userId: 'user-1',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-01',
      deviceId: 'dev-1',
    });

    expect(reads.groupParentTotalsBySource).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-uuid' }),
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('rejects invalid range and missing device', async () => {
    const reads = stubUsageReadRepository();
    const devices = stubSyncDevicesRepository({
      findByUserAndClientDeviceId: jest.fn(async () => null),
    });
    const service = new GetUsageSourcesService(reads, devices);

    await expect(
      service.execute({
        userId: 'user-1',
        timezone: 'UTC',
        from: '2026-07-09',
        to: '2026-07-01',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });

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
});

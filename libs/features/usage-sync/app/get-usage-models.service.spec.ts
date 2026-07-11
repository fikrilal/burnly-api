import { UNKNOWN_MODEL_IDENTITY_KEY } from './model-identity';
import { GetUsageModelsService } from './get-usage-models.service';
import type { AggregatedModelRow, UsageReadRepository } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { SyncErrorCode } from './usage-sync.error-codes';
import type { SyncDeviceRecord } from './usage-sync.types';

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

function modelRow(overrides: Partial<AggregatedModelRow> = {}): AggregatedModelRow {
  return {
    modelIdentityKey: 'claude-sonnet-4',
    rawModelId: 'claude-sonnet-4',
    displayName: null,
    providerKey: 'anthropic',
    totalTokens: 80000n,
    inputTokens: 50000n,
    outputTokens: 30000n,
    cacheCreationTokens: 0n,
    cacheReadTokens: 0n,
    ...overrides,
  };
}

describe('GetUsageModelsService', () => {
  it('returns parent totals, models, and unattributed remainder', async () => {
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
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(async () => [
        modelRow({ totalTokens: 80000n }),
        modelRow({
          modelIdentityKey: UNKNOWN_MODEL_IDENTITY_KEY,
          rawModelId: null,
          providerKey: null,
          totalTokens: 5000n,
          inputTokens: null,
          outputTokens: null,
        }),
      ]),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageModelsService(reads, devices);
    const view = await service.execute({
      userId: 'user-1',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-09',
    });

    expect(view.parentTotals).toEqual({ totalTokens: 100000, factCount: 40 });
    expect(view.models).toHaveLength(2);
    expect(view.attribution).toEqual({
      modelsSumTokens: 85000,
      parentTotalTokens: 100000,
      unattributedTokens: 15000,
    });
    expect(view.deviceFilter).toBeNull();
    expect(view.sourceFilter).toBeNull();
  });

  it('passes sourceKey and device filter to repository', async () => {
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
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(async () => []),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => deviceRecord()),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageModelsService(reads, devices);
    const view = await service.execute({
      userId: 'user-1',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-01',
      deviceId: 'dev-1',
      sourceKey: 'claude-code',
    });

    expect(view.deviceFilter).toBe('dev-1');
    expect(view.sourceFilter).toBe('claude-code');
    expect(reads.sumParentTotals).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-uuid' }),
      expect.any(Date),
      expect.any(Date),
      'claude-code',
    );
    expect(reads.aggregateModelsByIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-uuid' }),
      expect.any(Date),
      expect.any(Date),
      'claude-code',
    );
  });

  it('rejects invalid range, timezone, and missing device', async () => {
    const reads = {
      sumParentTotals: jest.fn(),
      aggregateModelsByIdentity: jest.fn(),
    } as unknown as UsageReadRepository;
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => null),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };
    const service = new GetUsageModelsService(reads, devices);

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

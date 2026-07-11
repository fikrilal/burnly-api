import { UNKNOWN_MODEL_IDENTITY_KEY } from './model-identity';
import { GetUsageSourceModelsService } from './get-usage-source-models.service';
import type { UsageReadRepository } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { stubSyncDevicesRepository, stubUsageReadRepository } from './usage-read-test-doubles';

describe('GetUsageSourceModelsService', () => {
  it('returns models and attribution for a source', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(async () => ({
        totalTokens: 70000n,
        factCount: 20,
        inputTokens: null,
        outputTokens: null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
      })),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(async () => [
        {
          modelIdentityKey: 'claude-sonnet-4',
          rawModelId: 'claude-sonnet-4',
          displayName: null,
          providerKey: 'anthropic',
          totalTokens: 65000n,
          inputTokens: 40000n,
          outputTokens: 25000n,
          cacheCreationTokens: 0n,
          cacheReadTokens: 0n,
        },
        {
          modelIdentityKey: UNKNOWN_MODEL_IDENTITY_KEY,
          rawModelId: null,
          displayName: null,
          providerKey: null,
          totalTokens: 1000n,
          inputTokens: null,
          outputTokens: null,
          cacheCreationTokens: null,
          cacheReadTokens: null,
        },
      ]),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageSourceModelsService(reads, devices);
    const view = await service.execute({
      userId: 'user-1',
      sourceKey: 'claude-code',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-09',
    });

    expect(view.sourceKey).toBe('claude-code');
    expect(view.parentTotals).toEqual({ totalTokens: 70000, factCount: 20 });
    expect(view.attribution).toEqual({
      modelsSumTokens: 66000,
      parentTotalTokens: 70000,
      unattributedTokens: 4000,
    });
    expect(reads.sumParentTotals).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Date),
      expect.any(Date),
      'claude-code',
    );
  });

  it('returns empty for unknown source without 404', async () => {
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
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(async () => []),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageSourceModelsService(reads, devices);
    const view = await service.execute({
      userId: 'user-1',
      sourceKey: 'never-pushed',
      timezone: 'UTC',
      from: '2026-07-01',
      to: '2026-07-01',
    });

    expect(view.models).toEqual([]);
    expect(view.parentTotals.totalTokens).toBe(0);
    expect(view.attribution.unattributedTokens).toBe(0);
  });

  it('rejects blank sourceKey', async () => {
    const reads = stubUsageReadRepository();
    const devices = stubSyncDevicesRepository();
    const service = new GetUsageSourceModelsService(reads, devices);

    await expect(
      service.execute({
        userId: 'user-1',
        sourceKey: '   ',
        timezone: 'UTC',
        from: '2026-07-01',
        to: '2026-07-01',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });
});

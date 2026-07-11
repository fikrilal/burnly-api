import { GetUsageDayService, MAX_USAGE_DAY_FACTS } from './get-usage-day.service';
import type {
  UsageReadModelFact,
  UsageReadParentFact,
  UsageReadRepository,
} from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { SyncErrorCode } from './usage-sync.error-codes';
import type { SyncDeviceRecord } from './usage-sync.types';
import { stubSyncDevicesRepository, stubUsageReadRepository } from './usage-read-test-doubles';

function parent(overrides: Partial<UsageReadParentFact> = {}): UsageReadParentFact {
  return {
    id: 'fact-1',
    identityKey: 'claude-code:daily:v1:UTC:2026-07-08',
    identityVersion: 1,
    sourceKey: 'claude-code',
    usageDate: '2026-07-08',
    aggregationTimezone: 'UTC',
    device: {
      clientDeviceId: 'dev-1',
      displayName: 'laptop',
      platform: 'linux',
    },
    inputTokens: 1200n,
    outputTokens: 800n,
    cacheCreationTokens: 0n,
    cacheReadTokens: 100n,
    totalTokens: 2100n,
    unclassifiedTokens: 0n,
    costStatus: 'estimated',
    costKind: 'collector_calculated',
    costAmountMicros: 12345n,
    costCurrency: 'USD',
    dataQuality: 'complete',
    recordState: 'active',
    clientLastSeenAt: new Date('2026-07-09T02:00:00.000Z'),
    clientRevision: 42n,
    syncedAt: new Date('2026-07-09T12:00:00.000Z'),
    ...overrides,
  };
}

function model(overrides: Partial<UsageReadModelFact> = {}): UsageReadModelFact {
  return {
    id: 'model-1',
    dailyUsageFactId: 'fact-1',
    modelIdentityKey: 'claude-sonnet-4',
    rawModelId: 'claude-sonnet-4',
    displayName: null,
    providerKey: 'anthropic',
    inputTokens: 1200n,
    outputTokens: 800n,
    cacheCreationTokens: 0n,
    cacheReadTokens: 0n,
    totalTokens: 2000n,
    costStatus: 'unavailable',
    costKind: null,
    costAmountMicros: null,
    costCurrency: null,
    ...overrides,
  };
}

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

describe('GetUsageDayService', () => {
  it('returns empty day with zeros (not 404)', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(async () => []),
      listModelsForFactIds: jest.fn(async () => []),
      aggregateModelsByIdentity: jest.fn(),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageDayService(reads, devices);
    const view = await service.execute({
      userId: 'user-1',
      date: '2026-07-08',
      timezone: 'UTC',
    });

    expect(view).toMatchObject({
      date: '2026-07-08',
      timezone: 'UTC',
      deviceFilter: null,
      totals: {
        totalTokens: 0,
        inputTokens: null,
        cost: { status: 'unavailable', factsTotal: 0 },
      },
      bySource: [],
      facts: [],
    });
  });

  it('builds totals, bySource, models, and unattributed remainder', async () => {
    const p1 = parent({ id: 'fact-1', totalTokens: 2100n });
    const p2 = parent({
      id: 'fact-2',
      sourceKey: 'codex',
      identityKey: 'codex:daily:v1:UTC:2026-07-08',
      totalTokens: 900n,
      inputTokens: 500n,
      outputTokens: 400n,
      cacheCreationTokens: null,
      cacheReadTokens: null,
      costStatus: 'unavailable',
      costAmountMicros: null,
      costCurrency: null,
      device: { clientDeviceId: 'dev-2', displayName: 'studio', platform: 'macos' },
    });

    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(async () => [p1, p2]),
      listModelsForFactIds: jest.fn(async () => [
        model({ dailyUsageFactId: 'fact-1', totalTokens: 2000n }),
      ]),
      aggregateModelsByIdentity: jest.fn(),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageDayService(reads, devices);
    const view = await service.execute({
      userId: 'user-1',
      date: '2026-07-08',
      timezone: 'UTC',
    });

    expect(view.totals.totalTokens).toBe(3000);
    expect(view.totals.inputTokens).toBe(1700);
    expect(view.totals.cost.status).toBe('partial');
    expect(view.bySource).toEqual([
      { sourceKey: 'claude-code', totalTokens: 2100 },
      { sourceKey: 'codex', totalTokens: 900 },
    ]);
    expect(view.facts).toHaveLength(2);
    expect(view.facts[0]?.modelAttribution).toEqual({
      modelsTotalTokens: 2000,
      parentTotalTokens: 2100,
      unattributedTokens: 100,
    });
    expect(view.facts[1]?.models).toEqual([]);
    expect(view.facts[1]?.modelAttribution.unattributedTokens).toBe(900);
  });

  it('rejects invalid date and timezone', async () => {
    const reads = stubUsageReadRepository();
    const devices = stubSyncDevicesRepository();
    const service = new GetUsageDayService(reads, devices);

    await expect(
      service.execute({ userId: 'user-1', date: '2026-02-30', timezone: 'UTC' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });

    await expect(
      service.execute({ userId: 'user-1', date: '2026-07-08', timezone: 'Not/A_Zone' }),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('throws SYNC_DEVICE_NOT_FOUND for missing device filter', async () => {
    const reads = stubUsageReadRepository();
    const devices = stubSyncDevicesRepository({
      findByUserAndClientDeviceId: jest.fn(async () => null),
    });
    const service = new GetUsageDayService(reads, devices);

    await expect(
      service.execute({
        userId: 'user-1',
        date: '2026-07-08',
        timezone: 'UTC',
        deviceId: 'missing',
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    });
  });

  it('passes resolved device id to repository', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(async () => []),
      listModelsForFactIds: jest.fn(async () => []),
      aggregateModelsByIdentity: jest.fn(),
      maxDeviceLastSyncAt: jest.fn(),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => deviceRecord()),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageDayService(reads, devices);
    await service.execute({
      userId: 'user-1',
      date: '2026-07-08',
      timezone: 'UTC',
      deviceId: 'dev-1',
    });

    expect(reads.listActiveParentsForDay).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-uuid' }),
      new Date('2026-07-08T00:00:00.000Z'),
    );
  });

  it('rejects pathological fact counts', async () => {
    const many = Array.from({ length: MAX_USAGE_DAY_FACTS + 1 }, (_, i) =>
      parent({ id: `fact-${i}`, identityKey: `claude-code:daily:v1:UTC:2026-07-08:${i}` }),
    );
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(),
      sumParentCost: jest.fn(),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(async () => many),
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

    const service = new GetUsageDayService(reads, devices);
    await expect(
      service.execute({ userId: 'user-1', date: '2026-07-08', timezone: 'UTC' }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL' });
  });
});

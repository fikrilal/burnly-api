import type { Clock } from '../../../shared/time';
import { GetUsageSummaryService } from './get-usage-summary.service';
import type {
  ParentCostAggregateResult,
  ParentTotalsResult,
  UsageReadRepository,
} from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { SyncErrorCode } from './usage-sync.error-codes';
import type { SyncDeviceRecord } from './usage-sync.types';
import { stubSyncDevicesRepository, stubUsageReadRepository } from './usage-read-test-doubles';

function emptyTotals(overrides: Partial<ParentTotalsResult> = {}): ParentTotalsResult {
  return {
    totalTokens: 0n,
    factCount: 0,
    inputTokens: null,
    outputTokens: null,
    cacheCreationTokens: null,
    cacheReadTokens: null,
    ...overrides,
  };
}

function emptyCost(): ParentCostAggregateResult {
  return { factsWithCost: 0, currencies: [] };
}

function deviceRecord(overrides: Partial<SyncDeviceRecord> = {}): SyncDeviceRecord {
  return {
    id: 'device-uuid',
    userId: 'user-1',
    clientDeviceId: 'dev-1',
    displayName: 'laptop',
    platform: 'linux',
    appVersion: '0.1.20',
    reportingTimezone: 'UTC',
    lastSyncAt: new Date('2026-07-15T03:55:00.000Z'),
    lastClientRevision: 1n,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-15T03:55:00.000Z'),
    ...overrides,
  };
}

describe('GetUsageSummaryService', () => {
  const fixedNow = new Date('2026-07-15T12:00:00.000Z');
  const clock: Clock = { now: () => fixedNow };

  it('aggregates today/week/month windows for UTC', async () => {
    const calls: Array<{ from: string; to: string }> = [];

    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(async (_scope, fromDate, toDate) => {
        calls.push({ from: fromDate.toISOString(), to: toDate.toISOString() });
        if (fromDate.toISOString().startsWith('2026-07-15')) {
          return emptyTotals({
            totalTokens: 100n,
            factCount: 1,
            inputTokens: 60n,
            outputTokens: 40n,
          });
        }
        if (fromDate.toISOString().startsWith('2026-07-09')) {
          return emptyTotals({ totalTokens: 300n, factCount: 3 });
        }
        return emptyTotals({ totalTokens: 1000n, factCount: 10 });
      }),
      sumParentCost: jest.fn(async () => emptyCost()),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(),
      maxDeviceLastSyncAt: jest.fn(async () => new Date('2026-07-15T03:55:00.000Z')),
    };

    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageSummaryService(reads, devices, clock);
    const view = await service.execute({ userId: 'user-1', timezone: 'UTC' });

    expect(view.timezone).toBe('UTC');
    expect(view.asOf).toBe(fixedNow.toISOString());
    expect(view.deviceFilter).toBeNull();
    expect(view.lastSyncAt).toBe('2026-07-15T03:55:00.000Z');

    expect(view.periods.today).toMatchObject({
      startDate: '2026-07-15',
      endDate: '2026-07-15',
      totalTokens: 100,
      inputTokens: 60,
      outputTokens: 40,
      cost: { status: 'unavailable', factsTotal: 1, factsWithCost: 0 },
    });
    expect(view.periods.week).toMatchObject({
      startDate: '2026-07-09',
      endDate: '2026-07-15',
      totalTokens: 300,
    });
    expect(view.periods.month).toMatchObject({
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      totalTokens: 1000,
    });

    expect(calls).toEqual(
      expect.arrayContaining([
        { from: '2026-07-15T00:00:00.000Z', to: '2026-07-15T00:00:00.000Z' },
        { from: '2026-07-09T00:00:00.000Z', to: '2026-07-15T00:00:00.000Z' },
        { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T00:00:00.000Z' },
      ]),
    );
  });

  it('rejects invalid timezone', async () => {
    const reads = stubUsageReadRepository();
    const devices = stubSyncDevicesRepository();

    const service = new GetUsageSummaryService(reads, devices, clock);
    await expect(
      service.execute({ userId: 'user-1', timezone: 'Not/A_Zone' }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
  });

  it('resolves device filter and throws when missing', async () => {
    const reads = stubUsageReadRepository();

    const devices = stubSyncDevicesRepository({
      findByUserAndClientDeviceId: jest.fn(async () => null),
    });

    const service = new GetUsageSummaryService(reads, devices, clock);
    await expect(
      service.execute({ userId: 'user-1', timezone: 'UTC', deviceId: 'missing' }),
    ).rejects.toMatchObject({
      status: 404,
      code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    });
  });

  it('passes resolved internal device id to reads', async () => {
    const reads: UsageReadRepository = {
      sumParentTotals: jest.fn(async () => emptyTotals()),
      sumParentCost: jest.fn(async () => emptyCost()),
      groupParentTotalsByDate: jest.fn(),
      groupParentTotalsBySource: jest.fn(),
      listActiveParentsForDay: jest.fn(),
      listModelsForFactIds: jest.fn(),
      aggregateModelsByIdentity: jest.fn(),
      maxDeviceLastSyncAt: jest.fn(async () => null),
    };
    const devices: SyncDevicesRepository = {
      upsertByClientDeviceId: jest.fn(),
      findByUserAndClientDeviceId: jest.fn(async () => deviceRecord()),
      listByUser: jest.fn(),
      markSyncSuccess: jest.fn(),
    };

    const service = new GetUsageSummaryService(reads, devices, clock);
    const view = await service.execute({
      userId: 'user-1',
      timezone: 'UTC',
      deviceId: 'dev-1',
    });

    expect(view.deviceFilter).toBe('dev-1');
    expect(reads.sumParentTotals).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        aggregationTimezone: 'UTC',
        deviceId: 'device-uuid',
      }),
      expect.any(Date),
      expect.any(Date),
    );
    expect(reads.maxDeviceLastSyncAt).toHaveBeenCalledWith('user-1', 'device-uuid');
  });
});

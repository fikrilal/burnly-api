import type { UsageReadRepository } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';

/** Full UsageReadRepository stub for unit tests (override only what the case needs). */
export function stubUsageReadRepository(
  overrides: Partial<UsageReadRepository> = {},
): UsageReadRepository {
  return {
    sumParentTotals: jest.fn(),
    sumParentCost: jest.fn(),
    groupParentTotalsByDate: jest.fn(),
    groupParentTotalsBySource: jest.fn(),
    listActiveParentsForDay: jest.fn(),
    listModelsForFactIds: jest.fn(),
    aggregateModelsByIdentity: jest.fn(),
    maxDeviceLastSyncAt: jest.fn(),
    ...overrides,
  };
}

/** Full SyncDevicesRepository stub for unit tests. */
export function stubSyncDevicesRepository(
  overrides: Partial<SyncDevicesRepository> = {},
): SyncDevicesRepository {
  return {
    upsertByClientDeviceId: jest.fn(),
    findByUserAndClientDeviceId: jest.fn(),
    listByUser: jest.fn(),
    markSyncSuccess: jest.fn(),
    ...overrides,
  };
}

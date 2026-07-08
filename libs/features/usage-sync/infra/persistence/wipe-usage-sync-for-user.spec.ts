import { wipeUsageSyncForUser } from './wipe-usage-sync-for-user';

describe('wipeUsageSyncForUser', () => {
  it('deletes in FK-safe order and returns counts', async () => {
    const calls: string[] = [];
    const tx = {
      dailyModelUsageFact: {
        deleteMany: jest.fn(async () => {
          calls.push('models');
          return { count: 3 };
        }),
      },
      dailyUsageFact: {
        deleteMany: jest.fn(async () => {
          calls.push('facts');
          return { count: 2 };
        }),
      },
      syncBatch: {
        deleteMany: jest.fn(async () => {
          calls.push('batches');
          return { count: 1 };
        }),
      },
      syncDevice: {
        deleteMany: jest.fn(async () => {
          calls.push('devices');
          return { count: 1 };
        }),
      },
    };

    const result = await wipeUsageSyncForUser(tx as never, 'user-1');

    expect(calls).toEqual(['models', 'facts', 'batches', 'devices']);
    expect(result).toEqual({
      modelsDeleted: 3,
      factsDeleted: 2,
      batchesDeleted: 1,
      devicesDeleted: 1,
    });

    for (const model of [
      tx.dailyModelUsageFact,
      tx.dailyUsageFact,
      tx.syncBatch,
      tx.syncDevice,
    ] as const) {
      expect(model.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    }
  });
});

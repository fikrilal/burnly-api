import { wipeUsageSyncForUser, type UsageSyncWipeTx } from './wipe-usage-sync-for-user';

describe('wipeUsageSyncForUser', () => {
  it('deletes in FK-safe order and returns counts', async () => {
    const calls: string[] = [];
    const tx: UsageSyncWipeTx = {
      dailyModelUsageFact: {
        deleteMany: async () => {
          calls.push('models');
          return { count: 3 };
        },
      },
      dailyUsageFact: {
        deleteMany: async () => {
          calls.push('facts');
          return { count: 2 };
        },
      },
      syncBatch: {
        deleteMany: async () => {
          calls.push('batches');
          return { count: 1 };
        },
      },
      syncDevice: {
        deleteMany: async () => {
          calls.push('devices');
          return { count: 1 };
        },
      },
    };

    const result = await wipeUsageSyncForUser(tx, 'user-1');

    expect(calls).toEqual(['models', 'facts', 'batches', 'devices']);
    expect(result).toEqual({
      modelsDeleted: 3,
      factsDeleted: 2,
      batchesDeleted: 1,
      devicesDeleted: 1,
    });
  });
});

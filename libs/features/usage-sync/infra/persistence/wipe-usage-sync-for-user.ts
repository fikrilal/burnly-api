/**
 * Hard-delete all usage-sync collect data for a user.
 *
 * Required on account finalization because the User row is soft-deleted
 * (status=DELETED) and Postgres ON DELETE CASCADE never runs.
 *
 * @see docs/adr/0020-daily-usage-cloud-projection.md
 * @see docs/exec-plans/completed/2026-07-09_usage-sync-05-account-deletion-wipe.md
 */

export type UsageSyncWipeTx = Readonly<{
  dailyModelUsageFact: {
    deleteMany: (args: { where: { userId: string } }) => Promise<{ count: number }>;
  };
  dailyUsageFact: {
    deleteMany: (args: { where: { userId: string } }) => Promise<{ count: number }>;
  };
  syncBatch: {
    deleteMany: (args: { where: { userId: string } }) => Promise<{ count: number }>;
  };
  syncDevice: {
    deleteMany: (args: { where: { userId: string } }) => Promise<{ count: number }>;
  };
}>;

export type WipeUsageSyncForUserResult = Readonly<{
  modelsDeleted: number;
  factsDeleted: number;
  batchesDeleted: number;
  devicesDeleted: number;
}>;

export async function wipeUsageSyncForUser(
  tx: UsageSyncWipeTx,
  userId: string,
): Promise<WipeUsageSyncForUserResult> {
  // Order respects FKs: model children → daily parents → batches → devices.
  const models = await tx.dailyModelUsageFact.deleteMany({ where: { userId } });
  const facts = await tx.dailyUsageFact.deleteMany({ where: { userId } });
  const batches = await tx.syncBatch.deleteMany({ where: { userId } });
  const devices = await tx.syncDevice.deleteMany({ where: { userId } });

  return {
    modelsDeleted: models.count,
    factsDeleted: facts.count,
    batchesDeleted: batches.count,
    devicesDeleted: devices.count,
  };
}

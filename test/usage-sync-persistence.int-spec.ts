import { UserStatus } from '@prisma/client';
import { PrismaService } from '../libs/platform/db/prisma.service';
import { PrismaDailyUsageFactsRepository } from '../libs/features/usage-sync/infra/persistence/prisma-daily-usage-facts.repository';
import { PrismaSyncBatchesRepository } from '../libs/features/usage-sync/infra/persistence/prisma-sync-batches.repository';
import { PrismaSyncDevicesRepository } from '../libs/features/usage-sync/infra/persistence/prisma-sync-devices.repository';
import { PrismaUsageReadRepository } from '../libs/features/usage-sync/infra/persistence/prisma-usage-read.repository';
import { UNKNOWN_MODEL_IDENTITY_KEY } from '../libs/features/usage-sync/app/model-identity';
import { createConfigService } from './support/stubs';

const databaseUrl = process.env.DATABASE_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !databaseUrl;

const describeIfDb = shouldSkip ? describe.skip : describe;

function createPrismaService(): PrismaService {
  const config = createConfigService({
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'development',
    DATABASE_SSL_REJECT_UNAUTHORIZED: true,
  });
  return new PrismaService(config);
}

describeIfDb('usage-sync persistence (int)', () => {
  let prisma: PrismaService;
  let devices: PrismaSyncDevicesRepository;
  let facts: PrismaDailyUsageFactsRepository;
  let batches: PrismaSyncBatchesRepository;
  let reads: PrismaUsageReadRepository;
  let userId: string;

  beforeAll(() => {
    prisma = createPrismaService();
    devices = new PrismaSyncDevicesRepository(prisma);
    facts = new PrismaDailyUsageFactsRepository(prisma);
    batches = new PrismaSyncBatchesRepository(prisma);
    reads = new PrismaUsageReadRepository(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    const client = prisma.getClient();
    const user = await client.user.create({
      data: {
        email: `usage-sync-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
        status: UserStatus.ACTIVE,
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    const client = prisma.getClient();
    await client.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  it('upserts devices by (userId, clientDeviceId)', async () => {
    const first = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-1',
      displayName: 'laptop',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });

    const second = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-1',
      displayName: 'laptop-renamed',
      platform: 'linux',
      appVersion: '0.1.21',
      reportingTimezone: 'Asia/Jakarta',
    });

    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe('laptop-renamed');
    expect(second.appVersion).toBe('0.1.21');
    expect(second.reportingTimezone).toBe('Asia/Jakarta');

    const found = await devices.findByUserAndClientDeviceId(userId, 'dev-1');
    expect(found?.id).toBe(first.id);
  });

  it('upserts daily facts and replaces model children; ignores stale revisions', async () => {
    const device = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-facts',
      platform: 'macos',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });

    const usageDate = new Date('2026-07-08T00:00:00.000Z');
    const base = {
      userId,
      deviceId: device.id,
      sourceKey: 'claude-code',
      identityKey: 'claude-code:daily:v1:UTC:2026-07-08',
      identityVersion: 1,
      usageDate,
      aggregationTimezone: 'UTC',
      inputTokens: 100n,
      outputTokens: 50n,
      cacheCreationTokens: 0n,
      cacheReadTokens: 0n,
      totalTokens: 150n,
      unclassifiedTokens: 0n,
      costStatus: 'unavailable' as const,
      costKind: 'unknown' as const,
      dataQuality: 'complete' as const,
      recordState: 'active' as const,
      clientFirstSeenAt: new Date('2026-07-08T10:00:00.000Z'),
      clientLastSeenAt: new Date('2026-07-08T12:00:00.000Z'),
      clientRevision: 1n,
      syncedAt: new Date('2026-07-09T12:00:00.000Z'),
    };

    const created = await facts.upsertFactWithModels({
      ...base,
      models: [
        {
          rawModelId: 'claude-sonnet-4',
          totalTokens: 150n,
          inputTokens: 100n,
          outputTokens: 50n,
          costStatus: 'unavailable',
        },
        {
          rawModelId: null,
          totalTokens: 0n,
          costStatus: 'unavailable',
        },
      ],
    });

    expect(created.outcome).toBe('created');
    expect(created.modelCount).toBe(2);

    const client = prisma.getClient();
    const modelsAfterCreate = await client.dailyModelUsageFact.findMany({
      where: { dailyUsageFactId: created.factId },
      orderBy: { modelIdentityKey: 'asc' },
    });
    expect(modelsAfterCreate).toHaveLength(2);
    expect(modelsAfterCreate.map((m) => m.modelIdentityKey).sort()).toEqual(
      ['claude-sonnet-4', UNKNOWN_MODEL_IDENTITY_KEY].sort(),
    );

    const updated = await facts.upsertFactWithModels({
      ...base,
      totalTokens: 200n,
      clientRevision: 2n,
      clientLastSeenAt: new Date('2026-07-08T13:00:00.000Z'),
      models: [
        {
          rawModelId: 'claude-sonnet-4',
          totalTokens: 200n,
          costStatus: 'unavailable',
        },
      ],
    });

    expect(updated.outcome).toBe('updated');
    expect(updated.factId).toBe(created.factId);
    expect(updated.modelCount).toBe(1);

    const modelsAfterUpdate = await client.dailyModelUsageFact.findMany({
      where: { dailyUsageFactId: created.factId },
    });
    expect(modelsAfterUpdate).toHaveLength(1);
    expect(modelsAfterUpdate[0]?.totalTokens).toBe(200n);

    const stale = await facts.upsertFactWithModels({
      ...base,
      totalTokens: 999n,
      clientRevision: 1n,
      clientLastSeenAt: new Date('2026-07-08T14:00:00.000Z'),
      models: [],
    });
    expect(stale.outcome).toBe('ignored_stale');

    const parent = await client.dailyUsageFact.findUniqueOrThrow({
      where: { id: created.factId },
    });
    expect(parent.totalTokens).toBe(200n);
    expect(parent.clientRevision).toBe(2n);
  });

  it('records sync batches and cascades on user delete', async () => {
    const device = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-batch',
      platform: 'windows',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });

    await facts.upsertFactWithModels({
      userId,
      deviceId: device.id,
      sourceKey: 'codex',
      identityKey: 'codex:daily:v1:UTC:2026-07-08',
      identityVersion: 1,
      usageDate: new Date('2026-07-08T00:00:00.000Z'),
      aggregationTimezone: 'UTC',
      totalTokens: 10n,
      costStatus: 'unavailable',
      costKind: 'unknown',
      dataQuality: 'complete',
      recordState: 'active',
      clientFirstSeenAt: new Date('2026-07-08T10:00:00.000Z'),
      clientLastSeenAt: new Date('2026-07-08T12:00:00.000Z'),
      clientRevision: 1n,
      syncedAt: new Date('2026-07-09T12:00:00.000Z'),
      models: [],
    });

    const batch = await batches.create({
      userId,
      deviceId: device.id,
      clientBatchId: 'batch-1',
      contractVersion: 1,
      clientRevision: 1n,
      status: 'accepted',
      recordsReceived: 1,
      recordsUpserted: 1,
      windowScope: 'incremental',
    });
    expect(batch.status).toBe('accepted');

    const client = prisma.getClient();
    await client.user.delete({ where: { id: userId } });

    expect(await client.syncDevice.count({ where: { userId } })).toBe(0);
    expect(await client.dailyUsageFact.count({ where: { userId } })).toBe(0);
    expect(await client.syncBatch.count({ where: { userId } })).toBe(0);
  });

  it('lists devices with lastSyncAt DESC NULLS LAST', async () => {
    const older = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-older-sync',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });
    const never = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-never-sync',
      platform: 'macos',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });
    const newer = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-newer-sync',
      platform: 'windows',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });

    await devices.markSyncSuccess({
      deviceId: older.id,
      syncedAt: new Date('2026-07-01T00:00:00.000Z'),
      clientRevision: 1n,
    });
    await devices.markSyncSuccess({
      deviceId: newer.id,
      syncedAt: new Date('2026-07-10T00:00:00.000Z'),
      clientRevision: 2n,
    });

    const listed = await devices.listByUser(userId);
    expect(listed.map((d) => d.clientDeviceId)).toEqual([
      'dev-newer-sync',
      'dev-older-sync',
      'dev-never-sync',
    ]);
    expect(listed[2]?.id).toBe(never.id);
  });

  it('read repository sums active parents, excludes removed, and groups by date', async () => {
    const deviceA = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-read-a',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });
    const deviceB = await devices.upsertByClientDeviceId({
      userId,
      clientDeviceId: 'dev-read-b',
      platform: 'macos',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });

    const day1 = new Date('2026-07-08T00:00:00.000Z');
    const day2 = new Date('2026-07-09T00:00:00.000Z');
    const syncedAt = new Date('2026-07-10T12:00:00.000Z');

    const baseFact = {
      userId,
      identityVersion: 1,
      aggregationTimezone: 'UTC',
      costStatus: 'unavailable' as const,
      costKind: 'unknown' as const,
      dataQuality: 'complete' as const,
      clientFirstSeenAt: new Date('2026-07-08T10:00:00.000Z'),
      clientLastSeenAt: new Date('2026-07-08T12:00:00.000Z'),
      clientRevision: 1n,
      syncedAt,
    };

    await facts.upsertFactWithModels({
      ...baseFact,
      deviceId: deviceA.id,
      sourceKey: 'claude-code',
      identityKey: 'claude-code:daily:v1:UTC:2026-07-08',
      usageDate: day1,
      totalTokens: 100n,
      inputTokens: 60n,
      outputTokens: 40n,
      recordState: 'active',
      models: [
        {
          rawModelId: 'claude-sonnet-4',
          totalTokens: 90n,
          costStatus: 'unavailable',
        },
      ],
    });

    await facts.upsertFactWithModels({
      ...baseFact,
      deviceId: deviceB.id,
      sourceKey: 'claude-code',
      identityKey: 'claude-code:daily:v1:UTC:2026-07-08',
      usageDate: day1,
      totalTokens: 50n,
      inputTokens: 30n,
      outputTokens: 20n,
      recordState: 'active',
      models: [
        {
          rawModelId: 'claude-sonnet-4',
          totalTokens: 50n,
          costStatus: 'unavailable',
        },
      ],
    });

    await facts.upsertFactWithModels({
      ...baseFact,
      deviceId: deviceA.id,
      sourceKey: 'codex',
      identityKey: 'codex:daily:v1:UTC:2026-07-09',
      usageDate: day2,
      totalTokens: 25n,
      recordState: 'active',
      models: [],
    });

    await facts.upsertFactWithModels({
      ...baseFact,
      deviceId: deviceA.id,
      sourceKey: 'opencode',
      identityKey: 'opencode:daily:v1:UTC:2026-07-08',
      usageDate: day1,
      totalTokens: 999n,
      recordState: 'removed',
      models: [],
    });

    const scope = { userId, aggregationTimezone: 'UTC' };

    const totals = await reads.sumParentTotals(scope, day1, day2);
    expect(totals.factCount).toBe(3);
    expect(totals.totalTokens).toBe(175n);
    expect(totals.inputTokens).toBe(90n);

    const byDate = await reads.groupParentTotalsByDate(scope, day1, day2);
    expect(byDate).toEqual([
      { usageDate: '2026-07-08', totalTokens: 150n, factCount: 2 },
      { usageDate: '2026-07-09', totalTokens: 25n, factCount: 1 },
    ]);

    const dayParents = await reads.listActiveParentsForDay(scope, day1);
    expect(dayParents).toHaveLength(2);
    expect(dayParents.map((p) => p.totalTokens).sort((a, b) => (a < b ? -1 : 1))).toEqual([
      50n,
      100n,
    ]);

    const models = await reads.listModelsForFactIds(
      userId,
      dayParents.map((p) => p.id),
    );
    expect(models).toHaveLength(2);

    const aggregated = await reads.aggregateModelsByIdentity(scope, day1, day2);
    expect(aggregated[0]?.modelIdentityKey).toBe('claude-sonnet-4');
    expect(aggregated[0]?.totalTokens).toBe(140n);

    const filtered = await reads.sumParentTotals({ ...scope, deviceId: deviceA.id }, day1, day2);
    expect(filtered.totalTokens).toBe(125n);
    expect(filtered.factCount).toBe(2);

    await devices.markSyncSuccess({
      deviceId: deviceA.id,
      syncedAt: new Date('2026-07-11T00:00:00.000Z'),
      clientRevision: 3n,
    });
    const maxSync = await reads.maxDeviceLastSyncAt(userId);
    expect(maxSync?.toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });
});

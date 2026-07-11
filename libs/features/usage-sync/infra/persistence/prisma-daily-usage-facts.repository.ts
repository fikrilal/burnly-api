import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import { withTransactionRetry } from '../../../../platform/db/tx-retry';
import { toModelIdentityKey } from '../../app/model-identity';
import type {
  CommitDailyUsagePushInput,
  CommitDailyUsagePushResult,
  DailyUsageFactsRepository,
} from '../../app/ports/daily-usage-facts.repository';
import type {
  DailyModelUsageWrite,
  UpsertDailyUsageFactInput,
  UpsertDailyUsageFactResult,
} from '../../app/usage-sync.types';

type Tx = Prisma.TransactionClient;

function isStaleWrite(input: {
  existingRevision: bigint;
  existingLastSeenAt: Date;
  nextRevision: bigint;
  nextLastSeenAt: Date;
}): boolean {
  if (input.nextRevision < input.existingRevision) return true;
  if (input.nextRevision > input.existingRevision) return false;
  return input.nextLastSeenAt.getTime() <= input.existingLastSeenAt.getTime();
}

function modelCreateManyData(
  userId: string,
  dailyUsageFactId: string,
  models: readonly DailyModelUsageWrite[],
) {
  return models.map((model) => {
    const modelIdentityKey = toModelIdentityKey(model.rawModelId);
    const rawModelId =
      model.rawModelId === undefined || model.rawModelId === null || model.rawModelId.trim() === ''
        ? null
        : model.rawModelId.trim();

    return {
      userId,
      dailyUsageFactId,
      rawModelId,
      modelIdentityKey,
      displayName: model.displayName ?? null,
      providerKey: model.providerKey ?? null,
      inputTokens: model.inputTokens ?? null,
      outputTokens: model.outputTokens ?? null,
      cacheCreationTokens: model.cacheCreationTokens ?? null,
      cacheReadTokens: model.cacheReadTokens ?? null,
      totalTokens: model.totalTokens ?? null,
      costStatus: model.costStatus,
      costKind: model.costKind ?? null,
      costAmountMicros: model.costAmountMicros ?? null,
      costCurrency: model.costCurrency ?? null,
    };
  });
}

async function upsertFactWithModelsTx(
  tx: Tx,
  input: UpsertDailyUsageFactInput,
): Promise<UpsertDailyUsageFactResult> {
  const existing = await tx.dailyUsageFact.findUnique({
    where: {
      userId_deviceId_identityKey: {
        userId: input.userId,
        deviceId: input.deviceId,
        identityKey: input.identityKey,
      },
    },
    select: {
      id: true,
      clientRevision: true,
      clientLastSeenAt: true,
    },
  });

  if (
    existing &&
    isStaleWrite({
      existingRevision: existing.clientRevision,
      existingLastSeenAt: existing.clientLastSeenAt,
      nextRevision: input.clientRevision,
      nextLastSeenAt: input.clientLastSeenAt,
    })
  ) {
    const modelCount = await tx.dailyModelUsageFact.count({
      where: { dailyUsageFactId: existing.id },
    });
    return {
      factId: existing.id,
      outcome: 'ignored_stale',
      modelCount,
    };
  }

  const parentData = {
    sourceKey: input.sourceKey,
    identityVersion: input.identityVersion,
    usageDate: input.usageDate,
    aggregationTimezone: input.aggregationTimezone,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    cacheCreationTokens: input.cacheCreationTokens ?? null,
    cacheReadTokens: input.cacheReadTokens ?? null,
    totalTokens: input.totalTokens,
    unclassifiedTokens: input.unclassifiedTokens ?? null,
    costStatus: input.costStatus,
    costKind: input.costKind,
    costAmountMicros: input.costAmountMicros ?? null,
    costCurrency: input.costCurrency ?? null,
    dataQuality: input.dataQuality,
    recordState: input.recordState,
    clientFirstSeenAt: input.clientFirstSeenAt,
    clientLastSeenAt: input.clientLastSeenAt,
    clientRemovedAt: input.clientRemovedAt ?? null,
    clientRevision: input.clientRevision,
    syncedAt: input.syncedAt,
  };

  let factId: string;
  let outcome: UpsertDailyUsageFactResult['outcome'];

  if (!existing) {
    const created = await tx.dailyUsageFact.create({
      data: {
        userId: input.userId,
        deviceId: input.deviceId,
        identityKey: input.identityKey,
        ...parentData,
      },
      select: { id: true },
    });
    factId = created.id;
    outcome = 'created';
  } else {
    await tx.dailyUsageFact.update({
      where: { id: existing.id },
      data: parentData,
    });
    factId = existing.id;
    outcome = 'updated';
    await tx.dailyModelUsageFact.deleteMany({
      where: { dailyUsageFactId: factId },
    });
  }

  if (input.models.length > 0) {
    await tx.dailyModelUsageFact.createMany({
      data: modelCreateManyData(input.userId, factId, input.models),
    });
  }

  return {
    factId,
    outcome,
    modelCount: input.models.length,
  };
}

@Injectable()
export class PrismaDailyUsageFactsRepository implements DailyUsageFactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFactWithModels(
    input: UpsertDailyUsageFactInput,
  ): Promise<UpsertDailyUsageFactResult> {
    const client = this.prisma.getClient();
    return withTransactionRetry(client, async (tx) => upsertFactWithModelsTx(tx, input));
  }

  async commitDailyUsagePush(
    input: CommitDailyUsagePushInput,
  ): Promise<CommitDailyUsagePushResult> {
    const client = this.prisma.getClient();

    return withTransactionRetry(client, async (tx) => {
      const factResults: UpsertDailyUsageFactResult[] = [];
      for (const fact of input.facts) {
        factResults.push(await upsertFactWithModelsTx(tx, fact));
      }

      let upserted = 0;
      let removed = 0;
      let unchanged = 0;
      for (let i = 0; i < factResults.length; i += 1) {
        const result = factResults[i];
        if (result === undefined) continue;
        const state = input.factRecordStates[i] ?? 'active';
        if (result.outcome === 'ignored_stale') {
          unchanged += 1;
          continue;
        }
        if (state === 'removed') removed += 1;
        else upserted += 1;
      }

      const counts = {
        received: input.facts.length,
        upserted,
        removed,
        unchanged,
        rejected: 0,
      };

      await tx.syncDevice.update({
        where: { id: input.deviceId },
        data: {
          lastSyncAt: input.syncedAt,
          lastClientRevision: input.clientRevision,
          appVersion: input.appVersion,
          reportingTimezone: input.reportingTimezone,
        },
      });

      await tx.syncBatch.create({
        data: {
          userId: input.batch.userId,
          deviceId: input.deviceId,
          clientBatchId: input.batch.clientBatchId ?? null,
          contractVersion: input.batch.contractVersion,
          clientRevision: input.clientRevision,
          appVersion: input.batch.appVersion,
          windowStartDate: input.batch.windowStartDate,
          windowEndDate: input.batch.windowEndDate,
          windowScope: input.batch.windowScope,
          status: 'accepted',
          recordsReceived: counts.received,
          recordsUpserted: counts.upserted,
          recordsRemoved: counts.removed,
          recordsUnchanged: counts.unchanged,
          traceId: input.batch.traceId ?? null,
        },
      });

      return { factResults, counts };
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../platform/db/prisma.service';
import { withTransactionRetry } from '../../../../platform/db/tx-retry';
import { toModelIdentityKey } from '../../app/model-identity';
import type { DailyUsageFactsRepository } from '../../app/ports/daily-usage-facts.repository';
import type {
  DailyModelUsageWrite,
  UpsertDailyUsageFactInput,
  UpsertDailyUsageFactResult,
} from '../../app/usage-sync.types';

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

@Injectable()
export class PrismaDailyUsageFactsRepository implements DailyUsageFactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFactWithModels(
    input: UpsertDailyUsageFactInput,
  ): Promise<UpsertDailyUsageFactResult> {
    const client = this.prisma.getClient();

    return withTransactionRetry(client, async (tx) => {
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
    });
  }
}

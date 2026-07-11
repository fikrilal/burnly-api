import { Injectable } from '@nestjs/common';
import type { DailyModelUsageFact, DailyUsageFact, Prisma, SyncDevice } from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import { rawModelIdFromIdentityKey } from '../../app/model-identity';
import type {
  AggregatedModelRow,
  ParentCostAggregateResult,
  ParentTotalsByDateRow,
  ParentTotalsResult,
  UsageReadModelFact,
  UsageReadParentFact,
  UsageReadRepository,
  UsageReadScope,
} from '../../app/ports/usage-read.repository';
import {
  isCostKind,
  isCostStatus,
  isDataQuality,
  isRecordState,
} from '../../app/daily-usage-validation';
import type {
  SyncDevicePlatform,
  UsageCostKind,
  UsageCostStatus,
  UsageDataQuality,
  UsageRecordState,
} from '../../app/usage-sync.types';
import { utcDateToUsageDateString } from '../../domain/calendar-date';

type ParentWithDevice = DailyUsageFact & { device: SyncDevice };

function parentWhere(
  scope: UsageReadScope,
  fromDate: Date,
  toDate: Date,
  sourceKey?: string,
): Prisma.DailyUsageFactWhereInput {
  return {
    userId: scope.userId,
    aggregationTimezone: scope.aggregationTimezone,
    recordState: 'active',
    usageDate: { gte: fromDate, lte: toDate },
    ...(scope.deviceId ? { deviceId: scope.deviceId } : {}),
    ...(sourceKey ? { sourceKey } : {}),
  };
}

function toPlatform(value: string): SyncDevicePlatform {
  switch (value) {
    case 'linux':
    case 'macos':
    case 'windows':
      return value;
    default:
      // Stored via SyncDevicePlatform enum; unexpected values should not appear.
      return 'linux';
  }
}

function toCostStatus(value: string): UsageCostStatus {
  if (isCostStatus(value)) return value;
  return 'unavailable';
}

function toCostKind(value: string | null): UsageCostKind | null {
  if (value === null) return null;
  if (isCostKind(value)) return value;
  return 'unknown';
}

function toRequiredCostKind(value: string): UsageCostKind {
  if (isCostKind(value)) return value;
  return 'unknown';
}

function toDataQuality(value: string): UsageDataQuality {
  if (isDataQuality(value)) return value;
  return 'partial';
}

function toRecordState(value: string): UsageRecordState {
  if (isRecordState(value)) return value;
  return 'active';
}

function toParentFact(row: ParentWithDevice): UsageReadParentFact {
  return {
    id: row.id,
    identityKey: row.identityKey,
    identityVersion: row.identityVersion,
    sourceKey: row.sourceKey,
    usageDate: utcDateToUsageDateString(row.usageDate),
    aggregationTimezone: row.aggregationTimezone,
    device: {
      clientDeviceId: row.device.clientDeviceId,
      displayName: row.device.displayName,
      platform: toPlatform(row.device.platform),
    },
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheCreationTokens: row.cacheCreationTokens,
    cacheReadTokens: row.cacheReadTokens,
    totalTokens: row.totalTokens,
    unclassifiedTokens: row.unclassifiedTokens,
    costStatus: toCostStatus(row.costStatus),
    costKind: toRequiredCostKind(row.costKind),
    costAmountMicros: row.costAmountMicros,
    costCurrency: row.costCurrency,
    dataQuality: toDataQuality(row.dataQuality),
    recordState: toRecordState(row.recordState),
    clientLastSeenAt: row.clientLastSeenAt,
    clientRevision: row.clientRevision,
    syncedAt: row.syncedAt,
  };
}

function toModelFact(row: DailyModelUsageFact): UsageReadModelFact {
  return {
    id: row.id,
    dailyUsageFactId: row.dailyUsageFactId,
    modelIdentityKey: row.modelIdentityKey,
    rawModelId: row.rawModelId,
    displayName: row.displayName,
    providerKey: row.providerKey,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheCreationTokens: row.cacheCreationTokens,
    cacheReadTokens: row.cacheReadTokens,
    totalTokens: row.totalTokens,
    costStatus: toCostStatus(row.costStatus),
    costKind: toCostKind(row.costKind),
    costAmountMicros: row.costAmountMicros,
    costCurrency: row.costCurrency,
  };
}

@Injectable()
export class PrismaUsageReadRepository implements UsageReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async sumParentTotals(
    scope: UsageReadScope,
    fromDate: Date,
    toDate: Date,
    sourceKey?: string,
  ): Promise<ParentTotalsResult> {
    const client = this.prisma.getClient();
    const result = await client.dailyUsageFact.aggregate({
      where: parentWhere(scope, fromDate, toDate, sourceKey),
      _sum: {
        totalTokens: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
      },
      _count: { _all: true },
    });

    return {
      totalTokens: result._sum.totalTokens ?? 0n,
      factCount: result._count._all,
      inputTokens: result._sum.inputTokens,
      outputTokens: result._sum.outputTokens,
      cacheCreationTokens: result._sum.cacheCreationTokens,
      cacheReadTokens: result._sum.cacheReadTokens,
    };
  }

  async sumParentCost(
    scope: UsageReadScope,
    fromDate: Date,
    toDate: Date,
    sourceKey?: string,
  ): Promise<ParentCostAggregateResult> {
    const client = this.prisma.getClient();
    const where: Prisma.DailyUsageFactWhereInput = {
      ...parentWhere(scope, fromDate, toDate, sourceKey),
      costStatus: { in: ['available', 'estimated'] },
      costAmountMicros: { not: null },
      costCurrency: { not: null },
    };

    const groups = await client.dailyUsageFact.groupBy({
      by: ['costCurrency', 'costStatus'],
      where,
      _sum: { costAmountMicros: true },
      _count: { _all: true },
    });

    type Acc = {
      currency: string;
      amountMicros: bigint;
      factCount: number;
      hasAvailable: boolean;
      hasEstimated: boolean;
    };
    const byCurrency = new Map<string, Acc>();
    let factsWithCost = 0;

    for (const group of groups) {
      const currency = group.costCurrency;
      if (currency === null) continue;

      factsWithCost += group._count._all;
      const existing = byCurrency.get(currency) ?? {
        currency,
        amountMicros: 0n,
        factCount: 0,
        hasAvailable: false,
        hasEstimated: false,
      };
      existing.amountMicros += group._sum.costAmountMicros ?? 0n;
      existing.factCount += group._count._all;
      if (group.costStatus === 'available') existing.hasAvailable = true;
      if (group.costStatus === 'estimated') existing.hasEstimated = true;
      byCurrency.set(currency, existing);
    }

    return {
      factsWithCost,
      currencies: [...byCurrency.values()],
    };
  }

  async groupParentTotalsByDate(
    scope: UsageReadScope,
    fromDate: Date,
    toDate: Date,
  ): Promise<readonly ParentTotalsByDateRow[]> {
    const client = this.prisma.getClient();
    const rows = await client.dailyUsageFact.groupBy({
      by: ['usageDate'],
      where: parentWhere(scope, fromDate, toDate),
      _sum: { totalTokens: true },
      _count: { _all: true },
      orderBy: { usageDate: 'asc' },
    });

    return rows.map((row) => ({
      usageDate: utcDateToUsageDateString(row.usageDate),
      totalTokens: row._sum.totalTokens ?? 0n,
      factCount: row._count._all,
    }));
  }

  async listActiveParentsForDay(
    scope: UsageReadScope,
    usageDate: Date,
  ): Promise<readonly UsageReadParentFact[]> {
    const client = this.prisma.getClient();
    const rows = await client.dailyUsageFact.findMany({
      where: {
        userId: scope.userId,
        aggregationTimezone: scope.aggregationTimezone,
        recordState: 'active',
        usageDate,
        ...(scope.deviceId ? { deviceId: scope.deviceId } : {}),
      },
      include: { device: true },
      orderBy: [{ sourceKey: 'asc' }, { identityKey: 'asc' }],
    });

    // Stable secondary order by clientDeviceId (not available as Prisma order without raw).
    const mapped = rows.map(toParentFact);
    return mapped.sort((a, b) => {
      const bySource = a.sourceKey.localeCompare(b.sourceKey);
      if (bySource !== 0) return bySource;
      return a.device.clientDeviceId.localeCompare(b.device.clientDeviceId);
    });
  }

  async listModelsForFactIds(
    userId: string,
    factIds: readonly string[],
  ): Promise<readonly UsageReadModelFact[]> {
    if (factIds.length === 0) return [];

    const client = this.prisma.getClient();
    const rows = await client.dailyModelUsageFact.findMany({
      where: {
        userId,
        dailyUsageFactId: { in: [...factIds] },
      },
      orderBy: [{ dailyUsageFactId: 'asc' }, { modelIdentityKey: 'asc' }],
    });

    return rows.map(toModelFact);
  }

  async aggregateModelsByIdentity(
    scope: UsageReadScope,
    fromDate: Date,
    toDate: Date,
    sourceKey?: string,
  ): Promise<readonly AggregatedModelRow[]> {
    const client = this.prisma.getClient();

    const groups = await client.dailyModelUsageFact.groupBy({
      by: ['modelIdentityKey'],
      where: {
        userId: scope.userId,
        dailyUsageFact: parentWhere(scope, fromDate, toDate, sourceKey),
      },
      _sum: {
        totalTokens: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
      },
    });

    // Enrich display fields from a representative child row (latest parent lastSeen wins).
    const keys = groups.map((g) => g.modelIdentityKey);
    const displayByKey = new Map<
      string,
      { displayName: string | null; providerKey: string | null; rawModelId: string | null }
    >();

    if (keys.length > 0) {
      const samples = await client.dailyModelUsageFact.findMany({
        where: {
          userId: scope.userId,
          modelIdentityKey: { in: keys },
          dailyUsageFact: parentWhere(scope, fromDate, toDate, sourceKey),
        },
        select: {
          modelIdentityKey: true,
          rawModelId: true,
          displayName: true,
          providerKey: true,
          dailyUsageFact: { select: { clientLastSeenAt: true } },
        },
        orderBy: { dailyUsageFact: { clientLastSeenAt: 'desc' } },
      });

      for (const sample of samples) {
        if (displayByKey.has(sample.modelIdentityKey)) continue;
        displayByKey.set(sample.modelIdentityKey, {
          rawModelId: sample.rawModelId,
          displayName: sample.displayName,
          providerKey: sample.providerKey,
        });
      }
    }

    const rows: AggregatedModelRow[] = groups.map((g) => {
      const meta = displayByKey.get(g.modelIdentityKey);
      return {
        modelIdentityKey: g.modelIdentityKey,
        rawModelId: meta?.rawModelId ?? rawModelIdFromIdentityKey(g.modelIdentityKey),
        displayName: meta?.displayName ?? null,
        providerKey: meta?.providerKey ?? null,
        totalTokens: g._sum.totalTokens ?? 0n,
        inputTokens: g._sum.inputTokens,
        outputTokens: g._sum.outputTokens,
        cacheCreationTokens: g._sum.cacheCreationTokens,
        cacheReadTokens: g._sum.cacheReadTokens,
      };
    });

    rows.sort((a, b) => {
      if (a.totalTokens === b.totalTokens) {
        return a.modelIdentityKey.localeCompare(b.modelIdentityKey);
      }
      return a.totalTokens > b.totalTokens ? -1 : 1;
    });

    return rows;
  }

  async maxDeviceLastSyncAt(userId: string, deviceId?: string): Promise<Date | null> {
    const client = this.prisma.getClient();
    const result = await client.syncDevice.aggregate({
      where: {
        userId,
        ...(deviceId ? { id: deviceId } : {}),
      },
      _max: { lastSyncAt: true },
    });
    return result._max.lastSyncAt;
  }
}

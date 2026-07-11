import { ErrorCode } from '../../../shared/error-codes';
import { isUsageDateString, usageDateToUtcDate } from '../domain/calendar-date';
import { buildSummaryCostView, type SummaryCostView } from './cost-aggregate';
import { bigintToJsonNumber, nullableBigintToJsonNumber } from './json-bigint';
import { computeModelAttribution, sumModelTotalTokens } from './model-attribution';
import type {
  ParentCostAggregateResult,
  UsageReadModelFact,
  UsageReadParentFact,
  UsageReadRepository,
  UsageReadScope,
} from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { resolveOptionalClientDeviceId } from './resolve-client-device';
import { parseUsageTimezone } from './usage-read-query';
import { UsageSyncError } from './usage-sync.errors';
import type {
  SyncDevicePlatform,
  UsageCostKind,
  UsageCostStatus,
  UsageDataQuality,
  UsageRecordState,
} from './usage-sync.types';

/** Soft upper bound for facts returned for a single day (pathological multi-device). */
export const MAX_USAGE_DAY_FACTS = 500;

export type UsageDayCostJson = Readonly<{
  status: SummaryCostView['status'];
  amountMicros: number | string | null;
  currency: string | null;
  factsWithCost?: number;
  factsTotal?: number;
}>;

export type UsageDayModelJson = Readonly<{
  rawModelId: string | null;
  modelIdentityKey: string;
  displayName: string | null;
  providerKey: string | null;
  totalTokens: number | string | null;
  inputTokens: number | string | null;
  outputTokens: number | string | null;
  cacheCreationTokens: number | string | null;
  cacheReadTokens: number | string | null;
  cost: Readonly<{
    status: UsageCostStatus;
    kind: UsageCostKind | null;
    amountMicros: number | string | null;
    currency: string | null;
  }>;
}>;

export type UsageDayFactJson = Readonly<{
  identityKey: string;
  identityVersion: number;
  sourceKey: string;
  usageDate: string;
  aggregationTimezone: string;
  device: Readonly<{
    clientDeviceId: string;
    displayName: string | null;
    platform: SyncDevicePlatform;
  }>;
  inputTokens: number | string | null;
  outputTokens: number | string | null;
  cacheCreationTokens: number | string | null;
  cacheReadTokens: number | string | null;
  totalTokens: number | string;
  unclassifiedTokens: number | string | null;
  cost: Readonly<{
    status: UsageCostStatus;
    kind: UsageCostKind;
    amountMicros: number | string | null;
    currency: string | null;
  }>;
  dataQuality: UsageDataQuality;
  recordState: UsageRecordState;
  clientLastSeenAt: string;
  clientRevision: number | string;
  syncedAt: string;
  models: readonly UsageDayModelJson[];
  modelAttribution: Readonly<{
    modelsTotalTokens: number | string;
    parentTotalTokens: number | string;
    unattributedTokens: number | string;
  }>;
}>;

export type UsageDayView = Readonly<{
  date: string;
  timezone: string;
  deviceFilter: string | null;
  totals: Readonly<{
    totalTokens: number | string;
    inputTokens: number | string | null;
    outputTokens: number | string | null;
    cacheCreationTokens: number | string | null;
    cacheReadTokens: number | string | null;
    cost: UsageDayCostJson;
  }>;
  bySource: readonly Readonly<{
    sourceKey: string;
    totalTokens: number | string;
  }>[];
  facts: readonly UsageDayFactJson[];
}>;

export type GetUsageDayQuery = Readonly<{
  userId: string;
  date: string;
  timezone: string;
  deviceId?: string;
}>;

function sumNullable(values: ReadonlyArray<bigint | null>): bigint | null {
  let sum = 0n;
  let any = false;
  for (const value of values) {
    if (value !== null) {
      sum += value;
      any = true;
    }
  }
  return any ? sum : null;
}

function costAggregateFromParents(
  parents: readonly UsageReadParentFact[],
): ParentCostAggregateResult {
  type Acc = {
    currency: string;
    amountMicros: bigint;
    factCount: number;
    hasAvailable: boolean;
    hasEstimated: boolean;
  };
  const byCurrency = new Map<string, Acc>();
  let factsWithCost = 0;

  for (const parent of parents) {
    if (parent.costStatus !== 'available' && parent.costStatus !== 'estimated') continue;
    if (parent.costAmountMicros === null || parent.costCurrency === null) continue;

    factsWithCost += 1;
    const existing = byCurrency.get(parent.costCurrency) ?? {
      currency: parent.costCurrency,
      amountMicros: 0n,
      factCount: 0,
      hasAvailable: false,
      hasEstimated: false,
    };
    existing.amountMicros += parent.costAmountMicros;
    existing.factCount += 1;
    if (parent.costStatus === 'available') existing.hasAvailable = true;
    if (parent.costStatus === 'estimated') existing.hasEstimated = true;
    byCurrency.set(parent.costCurrency, existing);
  }

  return {
    factsWithCost,
    currencies: [...byCurrency.values()],
  };
}

function toModelJson(model: UsageReadModelFact): UsageDayModelJson {
  return {
    rawModelId: model.rawModelId,
    modelIdentityKey: model.modelIdentityKey,
    displayName: model.displayName,
    providerKey: model.providerKey,
    totalTokens: nullableBigintToJsonNumber(model.totalTokens),
    inputTokens: nullableBigintToJsonNumber(model.inputTokens),
    outputTokens: nullableBigintToJsonNumber(model.outputTokens),
    cacheCreationTokens: nullableBigintToJsonNumber(model.cacheCreationTokens),
    cacheReadTokens: nullableBigintToJsonNumber(model.cacheReadTokens),
    cost: {
      status: model.costStatus,
      kind: model.costKind,
      amountMicros: nullableBigintToJsonNumber(model.costAmountMicros),
      currency: model.costCurrency,
    },
  };
}

function toFactJson(
  parent: UsageReadParentFact,
  models: readonly UsageReadModelFact[],
): UsageDayFactJson {
  const modelsSum = sumModelTotalTokens(models);
  const attribution = computeModelAttribution(parent.totalTokens, modelsSum);

  return {
    identityKey: parent.identityKey,
    identityVersion: parent.identityVersion,
    sourceKey: parent.sourceKey,
    usageDate: parent.usageDate,
    aggregationTimezone: parent.aggregationTimezone,
    device: {
      clientDeviceId: parent.device.clientDeviceId,
      displayName: parent.device.displayName,
      platform: parent.device.platform,
    },
    inputTokens: nullableBigintToJsonNumber(parent.inputTokens),
    outputTokens: nullableBigintToJsonNumber(parent.outputTokens),
    cacheCreationTokens: nullableBigintToJsonNumber(parent.cacheCreationTokens),
    cacheReadTokens: nullableBigintToJsonNumber(parent.cacheReadTokens),
    totalTokens: bigintToJsonNumber(parent.totalTokens),
    unclassifiedTokens: nullableBigintToJsonNumber(parent.unclassifiedTokens),
    cost: {
      status: parent.costStatus,
      kind: parent.costKind,
      amountMicros: nullableBigintToJsonNumber(parent.costAmountMicros),
      currency: parent.costCurrency,
    },
    dataQuality: parent.dataQuality,
    recordState: parent.recordState,
    clientLastSeenAt: parent.clientLastSeenAt.toISOString(),
    clientRevision: bigintToJsonNumber(parent.clientRevision),
    syncedAt: parent.syncedAt.toISOString(),
    models: models.map(toModelJson),
    modelAttribution: {
      modelsTotalTokens: bigintToJsonNumber(attribution.modelsTotalTokens),
      parentTotalTokens: bigintToJsonNumber(attribution.parentTotalTokens),
      unattributedTokens: bigintToJsonNumber(attribution.unattributedTokens),
    },
  };
}

export class GetUsageDayService {
  constructor(
    private readonly reads: UsageReadRepository,
    private readonly devices: SyncDevicesRepository,
  ) {}

  async execute(query: GetUsageDayQuery): Promise<UsageDayView> {
    if (!isUsageDateString(query.date)) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues: [{ field: 'date', message: 'date must be a valid YYYY-MM-DD calendar date' }],
      });
    }

    const tz = parseUsageTimezone(query.timezone);
    if (!tz.ok) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues: [{ field: 'timezone', message: tz.message }],
      });
    }

    const clientDeviceFilter =
      query.deviceId === undefined || query.deviceId.trim() === ''
        ? undefined
        : query.deviceId.trim();

    if (clientDeviceFilter !== undefined && clientDeviceFilter.length > 128) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues: [{ field: 'deviceId', message: 'deviceId must be at most 128 characters' }],
      });
    }

    const internalDeviceId = await resolveOptionalClientDeviceId({
      userId: query.userId,
      clientDeviceId: clientDeviceFilter,
      devices: this.devices,
    });

    const scope: UsageReadScope = {
      userId: query.userId,
      aggregationTimezone: tz.timezone,
      ...(internalDeviceId ? { deviceId: internalDeviceId } : {}),
    };

    const usageDate = usageDateToUtcDate(query.date);
    const parents = await this.reads.listActiveParentsForDay(scope, usageDate);

    if (parents.length > MAX_USAGE_DAY_FACTS) {
      throw new UsageSyncError({
        status: 500,
        code: ErrorCode.INTERNAL,
        message: `Day detail exceeds ${MAX_USAGE_DAY_FACTS} facts; contact support`,
      });
    }

    const models = await this.reads.listModelsForFactIds(
      query.userId,
      parents.map((p) => p.id),
    );

    const modelsByParent = new Map<string, UsageReadModelFact[]>();
    for (const model of models) {
      const list = modelsByParent.get(model.dailyUsageFactId) ?? [];
      list.push(model);
      modelsByParent.set(model.dailyUsageFactId, list);
    }

    const facts = parents.map((parent) =>
      toFactJson(parent, modelsByParent.get(parent.id) ?? []),
    );

    let totalTokens = 0n;
    for (const parent of parents) {
      totalTokens += parent.totalTokens;
    }

    const bySourceMap = new Map<string, bigint>();
    for (const parent of parents) {
      bySourceMap.set(
        parent.sourceKey,
        (bySourceMap.get(parent.sourceKey) ?? 0n) + parent.totalTokens,
      );
    }
    const bySource = [...bySourceMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sourceKey, tokens]) => ({
        sourceKey,
        totalTokens: bigintToJsonNumber(tokens),
      }));

    const cost = buildSummaryCostView(parents.length, costAggregateFromParents(parents));

    return {
      date: query.date,
      timezone: tz.timezone,
      deviceFilter: clientDeviceFilter ?? null,
      totals: {
        totalTokens: bigintToJsonNumber(totalTokens),
        inputTokens: nullableBigintToJsonNumber(sumNullable(parents.map((p) => p.inputTokens))),
        outputTokens: nullableBigintToJsonNumber(sumNullable(parents.map((p) => p.outputTokens))),
        cacheCreationTokens: nullableBigintToJsonNumber(
          sumNullable(parents.map((p) => p.cacheCreationTokens)),
        ),
        cacheReadTokens: nullableBigintToJsonNumber(
          sumNullable(parents.map((p) => p.cacheReadTokens)),
        ),
        cost: {
          status: cost.status,
          amountMicros: nullableBigintToJsonNumber(cost.amountMicros),
          currency: cost.currency,
          factsWithCost: cost.factsWithCost,
          factsTotal: cost.factsTotal,
        },
      },
      bySource,
      facts,
    };
  }
}

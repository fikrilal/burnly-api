import { ErrorCode } from '../../../shared/error-codes';
import { bigintToJsonNumber, nullableBigintToJsonNumber } from './json-bigint';
import { computeModelAttribution } from './model-attribution';
import type { UsageReadRepository, UsageReadScope } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { resolveOptionalClientDeviceId } from './resolve-client-device';
import { parseUsageDateRange, parseUsageTimezone } from './usage-read-query';
import { UsageSyncError } from './usage-sync.errors';

const SOURCE_KEY_MAX = 64;

export type UsageModelsModelJson = Readonly<{
  modelIdentityKey: string;
  rawModelId: string | null;
  displayName: string | null;
  providerKey: string | null;
  totalTokens: number | string;
  inputTokens: number | string | null;
  outputTokens: number | string | null;
  cacheCreationTokens: number | string | null;
  cacheReadTokens: number | string | null;
}>;

export type UsageModelsView = Readonly<{
  timezone: string;
  from: string;
  to: string;
  deviceFilter: string | null;
  sourceFilter: string | null;
  parentTotals: Readonly<{
    totalTokens: number | string;
    factCount: number;
  }>;
  models: readonly UsageModelsModelJson[];
  attribution: Readonly<{
    modelsSumTokens: number | string;
    parentTotalTokens: number | string;
    unattributedTokens: number | string;
  }>;
}>;

export type GetUsageModelsQuery = Readonly<{
  userId: string;
  timezone: string;
  from: string;
  to: string;
  deviceId?: string;
  sourceKey?: string;
}>;

export class GetUsageModelsService {
  constructor(
    private readonly reads: UsageReadRepository,
    private readonly devices: SyncDevicesRepository,
  ) {}

  async execute(query: GetUsageModelsQuery): Promise<UsageModelsView> {
    const tz = parseUsageTimezone(query.timezone);
    if (!tz.ok) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues: [{ field: 'timezone', message: tz.message }],
      });
    }

    const range = parseUsageDateRange(query.from, query.to);
    if (!range.ok) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues: [{ field: 'from', message: range.message }],
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

    let sourceKey: string | undefined;
    if (query.sourceKey !== undefined && query.sourceKey.trim() !== '') {
      sourceKey = query.sourceKey.trim();
      if (sourceKey.length > SOURCE_KEY_MAX) {
        throw new UsageSyncError({
          status: 400,
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          issues: [
            {
              field: 'sourceKey',
              message: `sourceKey must be at most ${SOURCE_KEY_MAX} characters`,
            },
          ],
        });
      }
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

    const [parentTotals, models] = await Promise.all([
      this.reads.sumParentTotals(
        scope,
        range.range.fromDate,
        range.range.toDate,
        sourceKey,
      ),
      this.reads.aggregateModelsByIdentity(
        scope,
        range.range.fromDate,
        range.range.toDate,
        sourceKey,
      ),
    ]);

    let modelsSumTokens = 0n;
    for (const row of models) {
      modelsSumTokens += row.totalTokens;
    }

    const attribution = computeModelAttribution(parentTotals.totalTokens, modelsSumTokens);

    return {
      timezone: tz.timezone,
      from: range.range.from,
      to: range.range.to,
      deviceFilter: clientDeviceFilter ?? null,
      sourceFilter: sourceKey ?? null,
      parentTotals: {
        totalTokens: bigintToJsonNumber(parentTotals.totalTokens),
        factCount: parentTotals.factCount,
      },
      models: models.map((row) => ({
        modelIdentityKey: row.modelIdentityKey,
        rawModelId: row.rawModelId,
        displayName: row.displayName,
        providerKey: row.providerKey,
        totalTokens: bigintToJsonNumber(row.totalTokens),
        inputTokens: nullableBigintToJsonNumber(row.inputTokens),
        outputTokens: nullableBigintToJsonNumber(row.outputTokens),
        cacheCreationTokens: nullableBigintToJsonNumber(row.cacheCreationTokens),
        cacheReadTokens: nullableBigintToJsonNumber(row.cacheReadTokens),
      })),
      attribution: {
        modelsSumTokens: bigintToJsonNumber(attribution.modelsTotalTokens),
        parentTotalTokens: bigintToJsonNumber(attribution.parentTotalTokens),
        unattributedTokens: bigintToJsonNumber(attribution.unattributedTokens),
      },
    };
  }
}

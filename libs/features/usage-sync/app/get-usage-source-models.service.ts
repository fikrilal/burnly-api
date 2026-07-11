import { ErrorCode } from '../../../shared/error-codes';
import { bigintToJsonNumber, nullableBigintToJsonNumber } from './json-bigint';
import { computeModelAttribution } from './model-attribution';
import type { UsageReadRepository, UsageReadScope } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { resolveOptionalClientDeviceId } from './resolve-client-device';
import { parseUsageDateRange, parseUsageTimezone } from './usage-read-query';
import { UsageSyncError } from './usage-sync.errors';

const SOURCE_KEY_MAX = 64;

export type UsageSourceModelsModelJson = Readonly<{
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

export type UsageSourceModelsView = Readonly<{
  timezone: string;
  from: string;
  to: string;
  deviceFilter: string | null;
  sourceKey: string;
  parentTotals: Readonly<{
    totalTokens: number | string;
    factCount: number;
  }>;
  models: readonly UsageSourceModelsModelJson[];
  attribution: Readonly<{
    modelsSumTokens: number | string;
    parentTotalTokens: number | string;
    unattributedTokens: number | string;
  }>;
}>;

export type GetUsageSourceModelsQuery = Readonly<{
  userId: string;
  sourceKey: string;
  timezone: string;
  from: string;
  to: string;
  deviceId?: string;
}>;

function parseRequiredSourceKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new UsageSyncError({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      issues: [{ field: 'sourceKey', message: 'sourceKey is required' }],
    });
  }
  if (trimmed.length > SOURCE_KEY_MAX) {
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
  return trimmed;
}

/**
 * Model breakdown for one product source over a date range.
 * Same authority rules as GET /v1/usage/models with sourceKey filter.
 * Unknown sourceKey → empty 200 (not 404).
 */
export class GetUsageSourceModelsService {
  constructor(
    private readonly reads: UsageReadRepository,
    private readonly devices: SyncDevicesRepository,
  ) {}

  async execute(query: GetUsageSourceModelsQuery): Promise<UsageSourceModelsView> {
    const sourceKey = parseRequiredSourceKey(query.sourceKey);

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
      this.reads.sumParentTotals(scope, range.range.fromDate, range.range.toDate, sourceKey),
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
      sourceKey,
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

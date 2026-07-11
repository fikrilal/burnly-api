import { ErrorCode } from '../../../shared/error-codes';
import { bigintToJsonNumber } from './json-bigint';
import type { UsageReadRepository, UsageReadScope } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { resolveOptionalClientDeviceId } from './resolve-client-device';
import { parseUsageDateRange, parseUsageTimezone } from './usage-read-query';
import { UsageSyncError } from './usage-sync.errors';

export type UsageSourceRowJson = Readonly<{
  sourceKey: string;
  totalTokens: number | string;
  factCount: number;
}>;

export type UsageSourcesData = Readonly<{
  timezone: string;
  from: string;
  to: string;
  deviceFilter: string | null;
  parentTotals: Readonly<{
    totalTokens: number | string;
    factCount: number;
  }>;
  sources: readonly UsageSourceRowJson[];
}>;

/** Pre-enveloped so ResponseEnvelopeInterceptor preserves meta.sourceCount. */
export type UsageSourcesEnvelope = Readonly<{
  data: UsageSourcesData;
  meta: Readonly<{ sourceCount: number }>;
}>;

export type GetUsageSourcesQuery = Readonly<{
  userId: string;
  timezone: string;
  from: string;
  to: string;
  deviceId?: string;
}>;

export class GetUsageSourcesService {
  constructor(
    private readonly reads: UsageReadRepository,
    private readonly devices: SyncDevicesRepository,
  ) {}

  async execute(query: GetUsageSourcesQuery): Promise<UsageSourcesEnvelope> {
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

    const [parentTotals, bySource] = await Promise.all([
      this.reads.sumParentTotals(scope, range.range.fromDate, range.range.toDate),
      this.reads.groupParentTotalsBySource(scope, range.range.fromDate, range.range.toDate),
    ]);

    const sources = bySource.map((row) => ({
      sourceKey: row.sourceKey,
      totalTokens: bigintToJsonNumber(row.totalTokens),
      factCount: row.factCount,
    }));

    return {
      data: {
        timezone: tz.timezone,
        from: range.range.from,
        to: range.range.to,
        deviceFilter: clientDeviceFilter ?? null,
        parentTotals: {
          totalTokens: bigintToJsonNumber(parentTotals.totalTokens),
          factCount: parentTotals.factCount,
        },
        sources,
      },
      meta: {
        sourceCount: sources.length,
      },
    };
  }
}

import { ErrorCode } from '../../../shared/error-codes';
import { denseDateSeries } from '../domain/dense-date-series';
import { bigintToJsonNumber } from './json-bigint';
import type { UsageReadRepository, UsageReadScope } from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { resolveOptionalClientDeviceId } from './resolve-client-device';
import { parseUsageDateRange, parseUsageTimezone } from './usage-read-query';
import { UsageSyncError } from './usage-sync.errors';

export type UsageCalendarDayJson = Readonly<{
  date: string;
  totalTokens: number | string;
  factCount: number;
  active: boolean;
}>;

export type UsageCalendarData = Readonly<{
  timezone: string;
  from: string;
  to: string;
  deviceFilter: string | null;
  days: readonly UsageCalendarDayJson[];
}>;

/** Pre-enveloped so ResponseEnvelopeInterceptor preserves meta.dayCount. */
export type UsageCalendarEnvelope = Readonly<{
  data: UsageCalendarData;
  meta: Readonly<{ dayCount: number }>;
}>;

export type GetUsageCalendarQuery = Readonly<{
  userId: string;
  timezone: string;
  from: string;
  to: string;
  /** Public clientDeviceId filter (query deviceId). */
  deviceId?: string;
}>;

export class GetUsageCalendarService {
  constructor(
    private readonly reads: UsageReadRepository,
    private readonly devices: SyncDevicesRepository,
  ) {}

  async execute(query: GetUsageCalendarQuery): Promise<UsageCalendarEnvelope> {
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
        issues: [
          {
            field: 'from',
            message: range.message,
          },
        ],
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

    const sparse = await this.reads.groupParentTotalsByDate(
      scope,
      range.range.fromDate,
      range.range.toDate,
    );

    const dense = denseDateSeries(range.range.from, range.range.to, sparse);

    return {
      data: {
        timezone: tz.timezone,
        from: range.range.from,
        to: range.range.to,
        deviceFilter: clientDeviceFilter ?? null,
        days: dense.map((day) => ({
          date: day.date,
          totalTokens: bigintToJsonNumber(day.totalTokens),
          factCount: day.factCount,
          active: day.active,
        })),
      },
      meta: {
        dayCount: dense.length,
      },
    };
  }
}

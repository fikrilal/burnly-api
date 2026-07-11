import type { Clock } from '../../../shared/time';
import { ErrorCode } from '../../../shared/error-codes';
import { usageDateToUtcDate } from '../domain/calendar-date';
import { summaryPeriodWindows, type DateWindow } from '../domain/period-windows';
import { buildSummaryCostView, type SummaryCostView } from './cost-aggregate';
import { bigintToJsonNumber, nullableBigintToJsonNumber } from './json-bigint';
import type {
  ParentTotalsResult,
  UsageReadRepository,
  UsageReadScope,
} from './ports/usage-read.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { resolveOptionalClientDeviceId } from './resolve-client-device';
import { parseUsageTimezone } from './usage-read-query';
import { UsageSyncError } from './usage-sync.errors';

export type UsageSummaryPeriodJson = Readonly<{
  startDate: string;
  endDate: string;
  totalTokens: number | string;
  inputTokens: number | string | null;
  outputTokens: number | string | null;
  cacheCreationTokens: number | string | null;
  cacheReadTokens: number | string | null;
  cost: Readonly<{
    status: SummaryCostView['status'];
    amountMicros: number | string | null;
    currency: string | null;
    factsWithCost: number;
    factsTotal: number;
  }>;
}>;

export type UsageSummaryView = Readonly<{
  timezone: string;
  asOf: string;
  periods: Readonly<{
    today: UsageSummaryPeriodJson;
    week: UsageSummaryPeriodJson;
    month: UsageSummaryPeriodJson;
  }>;
  deviceFilter: string | null;
  lastSyncAt: string | null;
}>;

export type GetUsageSummaryQuery = Readonly<{
  userId: string;
  timezone: string;
  /** Public clientDeviceId filter (query deviceId). */
  deviceId?: string;
}>;

function emptyTotals(): ParentTotalsResult {
  return {
    totalTokens: 0n,
    factCount: 0,
    inputTokens: null,
    outputTokens: null,
    cacheCreationTokens: null,
    cacheReadTokens: null,
  };
}

function emptyCost(factsTotal: number): SummaryCostView {
  return {
    status: 'unavailable',
    amountMicros: null,
    currency: null,
    factsWithCost: 0,
    factsTotal,
  };
}

function toPeriodJson(
  window: DateWindow,
  totals: ParentTotalsResult,
  cost: SummaryCostView,
): UsageSummaryPeriodJson {
  return {
    startDate: window.startDate,
    endDate: window.endDate,
    totalTokens: bigintToJsonNumber(totals.totalTokens),
    inputTokens: nullableBigintToJsonNumber(totals.inputTokens),
    outputTokens: nullableBigintToJsonNumber(totals.outputTokens),
    cacheCreationTokens: nullableBigintToJsonNumber(totals.cacheCreationTokens),
    cacheReadTokens: nullableBigintToJsonNumber(totals.cacheReadTokens),
    cost: {
      status: cost.status,
      amountMicros: nullableBigintToJsonNumber(cost.amountMicros),
      currency: cost.currency,
      factsWithCost: cost.factsWithCost,
      factsTotal: cost.factsTotal,
    },
  };
}

export class GetUsageSummaryService {
  constructor(
    private readonly reads: UsageReadRepository,
    private readonly devices: SyncDevicesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetUsageSummaryQuery): Promise<UsageSummaryView> {
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

    const now = this.clock.now();
    const windows = summaryPeriodWindows(now, tz.timezone);
    const scope: UsageReadScope = {
      userId: query.userId,
      aggregationTimezone: tz.timezone,
      ...(internalDeviceId ? { deviceId: internalDeviceId } : {}),
    };

    const [todayPeriod, weekPeriod, monthPeriod, lastSyncAt] = await Promise.all([
      this.loadPeriod(scope, windows.today),
      this.loadPeriod(scope, windows.week),
      this.loadPeriod(scope, windows.month),
      this.reads.maxDeviceLastSyncAt(query.userId, internalDeviceId),
    ]);

    return {
      timezone: tz.timezone,
      asOf: now.toISOString(),
      periods: {
        today: todayPeriod,
        week: weekPeriod,
        month: monthPeriod,
      },
      deviceFilter: clientDeviceFilter ?? null,
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
    };
  }

  private async loadPeriod(
    scope: UsageReadScope,
    window: DateWindow,
  ): Promise<UsageSummaryPeriodJson> {
    const fromDate = usageDateToUtcDate(window.startDate);
    const toDate = usageDateToUtcDate(window.endDate);

    const [totals, costAgg] = await Promise.all([
      this.reads.sumParentTotals(scope, fromDate, toDate),
      this.reads.sumParentCost(scope, fromDate, toDate),
    ]);

    const cost =
      totals.factCount === 0 ? emptyCost(0) : buildSummaryCostView(totals.factCount, costAgg);

    // Ensure zero totals still expose zero totalTokens (not missing).
    const safeTotals = totals.factCount === 0 ? emptyTotals() : totals;

    return toPeriodJson(window, safeTotals, cost);
  }
}

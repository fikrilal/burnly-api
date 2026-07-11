import { isUsageDateString, usageDateToUtcDate } from '../domain/calendar-date';

/** Inclusive max calendar days for usage range queries (calendar / models). */
export const MAX_USAGE_READ_RANGE_DAYS = 366;

export type ParsedUsageDateRange = Readonly<{
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
  dayCount: number;
}>;

export type UsageDateRangeParseResult =
  | Readonly<{ ok: true; range: ParsedUsageDateRange }>
  | Readonly<{ ok: false; message: string }>;

function inclusiveDayCount(from: string, to: string): number {
  const fromMs = usageDateToUtcDate(from).getTime();
  const toMs = usageDateToUtcDate(to).getTime();
  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

/**
 * Validate YYYY-MM-DD from/to inclusive range.
 * Enforces real calendar dates, to >= from, and max 366 days inclusive.
 */
export function parseUsageDateRange(from: string, to: string): UsageDateRangeParseResult {
  if (!isUsageDateString(from)) {
    return { ok: false, message: 'from must be a valid YYYY-MM-DD calendar date' };
  }
  if (!isUsageDateString(to)) {
    return { ok: false, message: 'to must be a valid YYYY-MM-DD calendar date' };
  }

  const dayCount = inclusiveDayCount(from, to);
  if (dayCount < 1) {
    return { ok: false, message: 'to must be greater than or equal to from' };
  }
  if (dayCount > MAX_USAGE_READ_RANGE_DAYS) {
    return {
      ok: false,
      message: `date range must be at most ${MAX_USAGE_READ_RANGE_DAYS} days inclusive`,
    };
  }

  return {
    ok: true,
    range: {
      from,
      to,
      fromDate: usageDateToUtcDate(from),
      toDate: usageDateToUtcDate(to),
      dayCount,
    },
  };
}

/**
 * IANA timezone id check via Intl (no extra dependency).
 * Rejects empty/whitespace; may reject some rare zone ids depending on runtime ICU data.
 */
export function isIanaTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  try {
    // Throws RangeError for invalid timeZone in supported engines.
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function parseUsageTimezone(
  value: string,
): Readonly<{ ok: true; timezone: string }> | Readonly<{ ok: false; message: string }> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'timezone is required' };
  }
  if (trimmed.length > 64) {
    return { ok: false, message: 'timezone must be at most 64 characters' };
  }
  if (!isIanaTimeZone(trimmed)) {
    return { ok: false, message: 'timezone must be a valid IANA time zone id' };
  }
  return { ok: true, timezone: trimmed };
}

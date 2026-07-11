import { addUsageDateDays, daysInMonth, isUsageDateString } from './calendar-date';

export type DateWindow = Readonly<{
  startDate: string;
  endDate: string;
}>;

export type SummaryPeriodWindows = Readonly<{
  today: DateWindow;
  week: DateWindow;
  month: DateWindow;
}>;

/**
 * Calendar YYYY-MM-DD for `now` in an IANA timezone (Intl formatToParts).
 * timeZone must already be validated as IANA.
 */
export function calendarDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  let year = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }

  const date = `${year}-${month}-${day}`;
  if (!isUsageDateString(date)) {
    throw new RangeError(`failed to resolve calendar date in timezone ${timeZone}`);
  }
  return date;
}

function lastDayOfMonthDate(yearMonthDay: string): string {
  const year = Number(yearMonthDay.slice(0, 4));
  const month = Number(yearMonthDay.slice(5, 7));
  const last = daysInMonth(year, month);
  return `${yearMonthDay.slice(0, 8)}${String(last).padStart(2, '0')}`;
}

/**
 * Fixed tray-style windows relative to "now" in the reporting timezone:
 * - today: single calendar day
 * - week: last 7 calendar days including today
 * - month: first..last day of the calendar month containing today
 */
export function summaryPeriodWindows(now: Date, timeZone: string): SummaryPeriodWindows {
  const today = calendarDateInTimeZone(now, timeZone);
  const weekStart = addUsageDateDays(today, -6);
  const monthStart = `${today.slice(0, 8)}01`;
  const monthEnd = lastDayOfMonthDate(today);

  return {
    today: { startDate: today, endDate: today },
    week: { startDate: weekStart, endDate: today },
    month: { startDate: monthStart, endDate: monthEnd },
  };
}

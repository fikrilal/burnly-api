/**
 * Pure calendar-date helpers (not wall-clock "now").
 * Kept outside app/ so Clock hygiene rules do not apply.
 */

const USAGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

export function isUsageDateString(value: string): boolean {
  if (!USAGE_DATE_RE.test(value)) return false;
  const parts = value.split('-');
  if (parts.length !== 3) return false;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/** Calendar date at UTC midnight for Postgres DATE columns. */
export function usageDateToUtcDate(usageDate: string): Date {
  const parts = usageDate.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a UTC-midnight Date back to YYYY-MM-DD (usage date string). */
export function utcDateToUsageDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add calendar days to a usage date string (UTC date arithmetic).
 * delta may be negative.
 */
export function addUsageDateDays(usageDate: string, deltaDays: number): string {
  const base = usageDateToUtcDate(usageDate);
  const next = new Date(base.getTime() + deltaDays * 86_400_000);
  return utcDateToUsageDateString(next);
}

/** Parse RFC 3339 / ISO-8601 timestamp to Date, or null if invalid. */
export function parseRfc3339ToDate(value: string): Date | null {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

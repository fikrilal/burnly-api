/**
 * UTC calendar window helpers for the public leaderboard (ADR 0023).
 * Pure — no Clock / Nest / Prisma.
 */

export type LeaderboardWindow = '7d' | '30d' | 'all';

export type UtcDateRange = Readonly<{
  window: LeaderboardWindow;
  /** Inclusive start YYYY-MM-DD; null for `all`. */
  windowStartDate: string | null;
  /** Inclusive end YYYY-MM-DD (today UTC for all windows). */
  windowEndDate: string;
}>;

const WINDOW_DAYS: Readonly<Record<'7d' | '30d', number>> = {
  '7d': 7,
  '30d': 30,
};

export function isLeaderboardWindow(value: string): value is LeaderboardWindow {
  return value === '7d' || value === '30d' || value === 'all';
}

/** Format a Date as UTC calendar date YYYY-MM-DD. */
export function utcCalendarDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addUtcCalendarDays(usageDate: string, deltaDays: number): string {
  const parts = usageDate.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const base = Date.UTC(year, month - 1, day);
  const next = new Date(base + deltaDays * 86_400_000);
  return utcCalendarDate(next);
}

/**
 * Resolve inclusive UTC window for a request "now".
 * `7d` / `30d` end today UTC and include that many calendar days.
 */
export function resolveLeaderboardWindow(window: LeaderboardWindow, now: Date): UtcDateRange {
  const windowEndDate = utcCalendarDate(now);
  if (window === 'all') {
    return { window, windowStartDate: null, windowEndDate };
  }
  const days = WINDOW_DAYS[window];
  // Inclusive last N days: start = end - (N - 1)
  const windowStartDate = addUtcCalendarDays(windowEndDate, -(days - 1));
  return { window, windowStartDate, windowEndDate };
}

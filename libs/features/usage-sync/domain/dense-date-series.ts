import { addUsageDateDays, isUsageDateString } from './calendar-date';

export type SparseDayTotal = Readonly<{
  usageDate: string;
  totalTokens: bigint;
  factCount: number;
}>;

export type DenseDayTotal = Readonly<{
  date: string;
  totalTokens: bigint;
  factCount: number;
  /** true when factCount > 0 */
  active: boolean;
}>;

/**
 * Expand sparse group-by rows into an inclusive dense calendar series.
 * Missing days get totalTokens=0, factCount=0, active=false.
 * from/to must already be validated YYYY-MM-DD with to >= from.
 */
export function denseDateSeries(
  from: string,
  to: string,
  sparse: ReadonlyArray<SparseDayTotal>,
): DenseDayTotal[] {
  if (!isUsageDateString(from) || !isUsageDateString(to)) {
    throw new RangeError('from and to must be valid YYYY-MM-DD calendar dates');
  }

  const byDate = new Map<string, SparseDayTotal>();
  for (const row of sparse) {
    byDate.set(row.usageDate, row);
  }

  const days: DenseDayTotal[] = [];
  let cursor = from;

  // Guard against inverted range: produce empty series.
  if (from > to) {
    return days;
  }

  for (;;) {
    const hit = byDate.get(cursor);
    if (hit) {
      days.push({
        date: cursor,
        totalTokens: hit.totalTokens,
        factCount: hit.factCount,
        active: hit.factCount > 0,
      });
    } else {
      days.push({
        date: cursor,
        totalTokens: 0n,
        factCount: 0,
        active: false,
      });
    }

    if (cursor === to) break;
    cursor = addUsageDateDays(cursor, 1);
  }

  return days;
}

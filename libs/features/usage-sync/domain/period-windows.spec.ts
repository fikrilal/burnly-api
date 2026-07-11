import { calendarDateInTimeZone, summaryPeriodWindows } from './period-windows';

describe('calendarDateInTimeZone', () => {
  it('resolves UTC calendar date', () => {
    const now = new Date('2026-07-15T04:00:00.000Z');
    expect(calendarDateInTimeZone(now, 'UTC')).toBe('2026-07-15');
  });

  it('crosses date boundaries for positive offsets', () => {
    // 2026-07-15 17:00 UTC = 2026-07-16 00:00 in Asia/Jakarta (UTC+7)
    const now = new Date('2026-07-15T17:00:00.000Z');
    expect(calendarDateInTimeZone(now, 'Asia/Jakarta')).toBe('2026-07-16');
  });
});

describe('summaryPeriodWindows', () => {
  it('builds today, rolling 7-day week, and calendar month', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    const windows = summaryPeriodWindows(now, 'UTC');

    expect(windows.today).toEqual({ startDate: '2026-07-15', endDate: '2026-07-15' });
    expect(windows.week).toEqual({ startDate: '2026-07-09', endDate: '2026-07-15' });
    expect(windows.month).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
  });

  it('handles end of February in a leap year', () => {
    const now = new Date('2024-02-20T12:00:00.000Z');
    const windows = summaryPeriodWindows(now, 'UTC');
    expect(windows.month).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' });
  });
});

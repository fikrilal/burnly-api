import { resolveLeaderboardWindow, utcCalendarDate } from './windows';

describe('leaderboard windows', () => {
  it('formats UTC calendar date', () => {
    expect(utcCalendarDate(new Date('2026-07-23T13:45:00.000Z'))).toBe('2026-07-23');
    expect(utcCalendarDate(new Date('2026-07-23T00:00:00.000Z'))).toBe('2026-07-23');
  });

  it('resolves 7d as inclusive last 7 UTC days ending today', () => {
    const now = new Date('2026-07-23T15:00:00.000Z');
    expect(resolveLeaderboardWindow('7d', now)).toEqual({
      window: '7d',
      windowStartDate: '2026-07-17',
      windowEndDate: '2026-07-23',
    });
  });

  it('resolves 30d inclusive', () => {
    const now = new Date('2026-07-23T00:00:00.000Z');
    expect(resolveLeaderboardWindow('30d', now)).toEqual({
      window: '30d',
      windowStartDate: '2026-06-24',
      windowEndDate: '2026-07-23',
    });
  });

  it('resolves all with null start', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    expect(resolveLeaderboardWindow('all', now)).toEqual({
      window: 'all',
      windowStartDate: null,
      windowEndDate: '2026-07-23',
    });
  });
});

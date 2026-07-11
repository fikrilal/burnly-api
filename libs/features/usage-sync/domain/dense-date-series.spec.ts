import { denseDateSeries } from './dense-date-series';

describe('denseDateSeries', () => {
  it('fills missing days with zeros', () => {
    const dense = denseDateSeries('2026-07-01', '2026-07-03', [
      { usageDate: '2026-07-02', totalTokens: 100n, factCount: 1 },
    ]);

    expect(dense).toEqual([
      { date: '2026-07-01', totalTokens: 0n, factCount: 0, active: false },
      { date: '2026-07-02', totalTokens: 100n, factCount: 1, active: true },
      { date: '2026-07-03', totalTokens: 0n, factCount: 0, active: false },
    ]);
  });

  it('returns a single day when from equals to', () => {
    const dense = denseDateSeries('2026-07-08', '2026-07-08', [
      { usageDate: '2026-07-08', totalTokens: 50n, factCount: 2 },
    ]);
    expect(dense).toHaveLength(1);
    expect(dense[0]).toEqual({
      date: '2026-07-08',
      totalTokens: 50n,
      factCount: 2,
      active: true,
    });
  });

  it('returns empty series for inverted range', () => {
    expect(denseDateSeries('2026-07-03', '2026-07-01', [])).toEqual([]);
  });

  it('marks active false when factCount is zero even if tokens present', () => {
    const dense = denseDateSeries('2026-07-01', '2026-07-01', [
      { usageDate: '2026-07-01', totalTokens: 0n, factCount: 0 },
    ]);
    expect(dense[0]?.active).toBe(false);
  });
});

import { buildDailyIdentityKey, isUsageDateString, usageDateToUtcDate } from './daily-identity';

describe('buildDailyIdentityKey', () => {
  it('matches desktop scheme', () => {
    expect(
      buildDailyIdentityKey({
        sourceKey: 'claude-code',
        identityVersion: 1,
        aggregationTimezone: 'UTC',
        usageDate: '2026-07-08',
      }),
    ).toBe('claude-code:daily:v1:UTC:2026-07-08');
  });
});

describe('isUsageDateString', () => {
  it('accepts valid calendar dates', () => {
    expect(isUsageDateString('2026-07-08')).toBe(true);
    expect(isUsageDateString('2024-02-29')).toBe(true);
  });

  it('rejects invalid shapes and calendar dates', () => {
    expect(isUsageDateString('2026-7-8')).toBe(false);
    expect(isUsageDateString('2026-02-30')).toBe(false);
    expect(isUsageDateString('not-a-date')).toBe(false);
  });
});

describe('usageDateToUtcDate', () => {
  it('uses UTC midnight', () => {
    const d = usageDateToUtcDate('2026-07-08');
    expect(d.toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });
});

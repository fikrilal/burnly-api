import {
  MAX_USAGE_READ_RANGE_DAYS,
  isIanaTimeZone,
  parseUsageDateRange,
  parseUsageTimezone,
} from './usage-read-query';

describe('parseUsageDateRange', () => {
  it('accepts a single-day range', () => {
    const result = parseUsageDateRange('2026-07-08', '2026-07-08');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.dayCount).toBe(1);
    expect(result.range.fromDate.toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });

  it('accepts max inclusive range of 366 days', () => {
    const result = parseUsageDateRange('2026-01-01', '2026-12-31');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.dayCount).toBe(365);
  });

  it('rejects ranges longer than 366 days inclusive', () => {
    // 2024 is leap year: 2024-01-01 .. 2025-01-01 = 367 days inclusive
    const result = parseUsageDateRange('2024-01-01', '2025-01-01');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(String(MAX_USAGE_READ_RANGE_DAYS));
  });

  it('accepts exactly 366 days inclusive', () => {
    // 2024-01-01 to 2024-12-31 = 366 (leap year)
    const result = parseUsageDateRange('2024-01-01', '2024-12-31');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.range.dayCount).toBe(366);
  });

  it('rejects inverted range', () => {
    const result = parseUsageDateRange('2026-07-09', '2026-07-01');
    expect(result.ok).toBe(false);
  });

  it('rejects invalid calendar dates', () => {
    expect(parseUsageDateRange('2026-02-30', '2026-03-01').ok).toBe(false);
    expect(parseUsageDateRange('2026-07-01', 'not-a-date').ok).toBe(false);
  });
});

describe('isIanaTimeZone / parseUsageTimezone', () => {
  it('accepts common IANA zones', () => {
    expect(isIanaTimeZone('UTC')).toBe(true);
    expect(isIanaTimeZone('Asia/Jakarta')).toBe(true);
    expect(isIanaTimeZone('America/Los_Angeles')).toBe(true);
  });

  it('rejects empty and invalid zones', () => {
    expect(isIanaTimeZone('')).toBe(false);
    expect(isIanaTimeZone('   ')).toBe(false);
    expect(isIanaTimeZone('Not/A_Zone')).toBe(false);
    expect(parseUsageTimezone('').ok).toBe(false);
    expect(parseUsageTimezone('Not/A_Zone').ok).toBe(false);
  });

  it('trims timezone input', () => {
    const result = parseUsageTimezone('  UTC  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timezone).toBe('UTC');
  });
});

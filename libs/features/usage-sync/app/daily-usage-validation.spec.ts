import { validateIdentityKey, validateParentCost, validateWindow } from './daily-usage-validation';

describe('validateParentCost', () => {
  it('requires amount+currency for estimated', () => {
    const issues: { field: string; message: string }[] = [];
    const parsed = validateParentCost(
      { status: 'estimated', kind: 'collector_calculated', amountMicros: 12, currency: 'USD' },
      'cost',
      issues,
    );
    expect(issues).toEqual([]);
    expect(parsed).toEqual({
      status: 'estimated',
      kind: 'collector_calculated',
      amountMicros: 12n,
      currency: 'USD',
    });
  });

  it('rejects amount when unavailable', () => {
    const issues: { field: string; message: string }[] = [];
    validateParentCost(
      { status: 'unavailable', kind: 'unknown', amountMicros: 1, currency: 'USD' },
      'cost',
      issues,
    );
    expect(issues.some((i) => i.field.includes('amountMicros'))).toBe(true);
  });
});

describe('validateIdentityKey', () => {
  it('accepts reconstructed key', () => {
    const issues: { field: string; message: string }[] = [];
    const ok = validateIdentityKey({
      identityKey: 'claude-code:daily:v1:UTC:2026-07-08',
      sourceKey: 'claude-code',
      identityVersion: 1,
      aggregationTimezone: 'UTC',
      usageDate: '2026-07-08',
      fieldPrefix: 'facts[0]',
      issues,
    });
    expect(ok).toBe(true);
    expect(issues).toEqual([]);
  });

  it('rejects mismatch', () => {
    const issues: { field: string; message: string }[] = [];
    const ok = validateIdentityKey({
      identityKey: 'wrong',
      sourceKey: 'claude-code',
      identityVersion: 1,
      aggregationTimezone: 'UTC',
      usageDate: '2026-07-08',
      fieldPrefix: 'facts[0]',
      issues,
    });
    expect(ok).toBe(false);
    expect(issues[0]?.field).toBe('facts[0].identityKey');
  });
});

describe('validateWindow', () => {
  it('accepts full, incremental, and deprecated rolling with ordered dates', () => {
    for (const scope of ['full', 'incremental', 'rolling'] as const) {
      const issues: { field: string; message: string }[] = [];
      expect(
        validateWindow({
          startDate: '2026-07-01',
          endDate: '2026-07-08',
          scope,
          issues,
        }),
      ).toBe(true);
      expect(issues).toHaveLength(0);
    }
  });

  it('rejects unknown scope and unordered dates', () => {
    const badScope: { field: string; message: string }[] = [];
    expect(
      validateWindow({
        startDate: '2026-07-01',
        endDate: '2026-07-08',
        scope: 'unknown',
        issues: badScope,
      }),
    ).toBe(false);
    expect(badScope.some((i) => i.field === 'window.scope')).toBe(true);

    const badDates: { field: string; message: string }[] = [];
    expect(
      validateWindow({
        startDate: '2026-07-10',
        endDate: '2026-07-01',
        scope: 'full',
        issues: badDates,
      }),
    ).toBe(false);
    expect(badDates.length).toBeGreaterThan(0);
  });
});

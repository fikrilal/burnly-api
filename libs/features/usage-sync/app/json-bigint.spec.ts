import { bigintToJsonNumber, nullableBigintToJsonNumber } from './json-bigint';

describe('bigintToJsonNumber', () => {
  it('maps safe integers to number', () => {
    expect(bigintToJsonNumber(0n)).toBe(0);
    expect(bigintToJsonNumber(150n)).toBe(150);
    expect(bigintToJsonNumber(-1n)).toBe(-1);
  });

  it('maps out-of-range values to string', () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(bigintToJsonNumber(tooBig)).toBe(tooBig.toString());
  });
});

describe('nullableBigintToJsonNumber', () => {
  it('maps nullish to null', () => {
    expect(nullableBigintToJsonNumber(null)).toBeNull();
    expect(nullableBigintToJsonNumber(undefined)).toBeNull();
  });

  it('maps present bigint', () => {
    expect(nullableBigintToJsonNumber(42n)).toBe(42);
  });
});

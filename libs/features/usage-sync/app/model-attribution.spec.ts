import { computeModelAttribution, sumModelTotalTokens } from './model-attribution';

describe('computeModelAttribution', () => {
  it('computes unattributed remainder when children under-sum', () => {
    expect(computeModelAttribution(2100n, 2000n)).toEqual({
      modelsTotalTokens: 2000n,
      parentTotalTokens: 2100n,
      unattributedTokens: 100n,
    });
  });

  it('clamps unattributed to zero when models exceed parent', () => {
    expect(computeModelAttribution(100n, 150n)).toEqual({
      modelsTotalTokens: 150n,
      parentTotalTokens: 100n,
      unattributedTokens: 0n,
    });
  });

  it('handles full attribution', () => {
    expect(computeModelAttribution(500n, 500n).unattributedTokens).toBe(0n);
  });
});

describe('sumModelTotalTokens', () => {
  it('treats null totalTokens as zero', () => {
    expect(
      sumModelTotalTokens([
        { totalTokens: 10n },
        { totalTokens: null },
        { totalTokens: undefined },
        { totalTokens: 5n },
      ]),
    ).toBe(15n);
  });
});

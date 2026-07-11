import { buildSummaryCostView } from './cost-aggregate';

describe('buildSummaryCostView', () => {
  it('returns unavailable when no cost-bearing facts', () => {
    expect(buildSummaryCostView(5, { factsWithCost: 0, currencies: [] })).toEqual({
      status: 'unavailable',
      amountMicros: null,
      currency: null,
      factsWithCost: 0,
      factsTotal: 5,
    });
  });

  it('returns mixed for multiple currencies', () => {
    expect(
      buildSummaryCostView(3, {
        factsWithCost: 3,
        currencies: [
          {
            currency: 'USD',
            amountMicros: 100n,
            factCount: 2,
            hasAvailable: true,
            hasEstimated: false,
          },
          {
            currency: 'EUR',
            amountMicros: 50n,
            factCount: 1,
            hasAvailable: true,
            hasEstimated: false,
          },
        ],
      }),
    ).toMatchObject({ status: 'mixed', amountMicros: null, currency: null, factsWithCost: 3 });
  });

  it('returns partial when some facts lack cost', () => {
    expect(
      buildSummaryCostView(5, {
        factsWithCost: 3,
        currencies: [
          {
            currency: 'USD',
            amountMicros: 999n,
            factCount: 3,
            hasAvailable: true,
            hasEstimated: false,
          },
        ],
      }),
    ).toEqual({
      status: 'partial',
      amountMicros: 999n,
      currency: 'USD',
      factsWithCost: 3,
      factsTotal: 5,
    });
  });

  it('returns estimated when all facts have cost and any estimated', () => {
    expect(
      buildSummaryCostView(2, {
        factsWithCost: 2,
        currencies: [
          {
            currency: 'USD',
            amountMicros: 10n,
            factCount: 2,
            hasAvailable: true,
            hasEstimated: true,
          },
        ],
      }).status,
    ).toBe('estimated');
  });

  it('returns available when all facts have available cost', () => {
    expect(
      buildSummaryCostView(1, {
        factsWithCost: 1,
        currencies: [
          {
            currency: 'USD',
            amountMicros: 10n,
            factCount: 1,
            hasAvailable: true,
            hasEstimated: false,
          },
        ],
      }).status,
    ).toBe('available');
  });
});

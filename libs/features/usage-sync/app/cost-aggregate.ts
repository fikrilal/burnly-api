import type { ParentCostAggregateResult } from './ports/usage-read.repository';

export type SummaryCostStatus = 'available' | 'estimated' | 'partial' | 'mixed' | 'unavailable';

export type SummaryCostView = Readonly<{
  status: SummaryCostStatus;
  amountMicros: bigint | null;
  currency: string | null;
  factsWithCost: number;
  factsTotal: number;
}>;

/**
 * Build period cost summary from parent cost aggregation + total fact count.
 *
 * - no cost-bearing facts → unavailable
 * - multiple currencies → mixed (no single amount)
 * - one currency, not every fact has cost → partial
 * - one currency, every fact has cost → estimated if any estimated else available
 */
export function buildSummaryCostView(
  factsTotal: number,
  costAgg: ParentCostAggregateResult,
): SummaryCostView {
  const factsWithCost = costAgg.factsWithCost;

  if (factsWithCost === 0 || costAgg.currencies.length === 0) {
    return {
      status: 'unavailable',
      amountMicros: null,
      currency: null,
      factsWithCost: 0,
      factsTotal,
    };
  }

  if (costAgg.currencies.length > 1) {
    return {
      status: 'mixed',
      amountMicros: null,
      currency: null,
      factsWithCost,
      factsTotal,
    };
  }

  const bucket = costAgg.currencies[0];
  if (!bucket) {
    return {
      status: 'unavailable',
      amountMicros: null,
      currency: null,
      factsWithCost: 0,
      factsTotal,
    };
  }

  let status: SummaryCostStatus;
  if (factsWithCost < factsTotal) {
    status = 'partial';
  } else if (bucket.hasEstimated) {
    status = 'estimated';
  } else {
    status = 'available';
  }

  return {
    status,
    amountMicros: bucket.amountMicros,
    currency: bucket.currency,
    factsWithCost,
    factsTotal,
  };
}

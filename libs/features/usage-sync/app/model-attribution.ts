/**
 * Parent totals are authoritative. Model children may under-attribute.
 * unattributedTokens = max(0, parentTotalTokens - modelsSumTokens).
 */
export type ModelAttribution = Readonly<{
  modelsTotalTokens: bigint;
  parentTotalTokens: bigint;
  unattributedTokens: bigint;
}>;

export function computeModelAttribution(
  parentTotalTokens: bigint,
  modelsSumTokens: bigint,
): ModelAttribution {
  const modelsTotalTokens = modelsSumTokens < 0n ? 0n : modelsSumTokens;
  const unattributedTokens =
    parentTotalTokens > modelsTotalTokens ? parentTotalTokens - modelsTotalTokens : 0n;

  return {
    modelsTotalTokens,
    parentTotalTokens,
    unattributedTokens,
  };
}

/** Sum model totalTokens treating null as 0. */
export function sumModelTotalTokens(
  models: ReadonlyArray<{ totalTokens: bigint | null | undefined }>,
): bigint {
  let sum = 0n;
  for (const model of models) {
    if (model.totalTokens !== null && model.totalTokens !== undefined) {
      sum += model.totalTokens;
    }
  }
  return sum;
}

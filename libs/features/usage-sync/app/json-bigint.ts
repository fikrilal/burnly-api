/**
 * Map Prisma bigint token/cost fields for JSON HTTP responses.
 * Safe integers stay numbers (matches collect e2e fixtures); out-of-range → string.
 */
export function bigintToJsonNumber(value: bigint): number | string {
  if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return value.toString();
}

export function nullableBigintToJsonNumber(
  value: bigint | null | undefined,
): number | string | null {
  if (value === null || value === undefined) return null;
  return bigintToJsonNumber(value);
}

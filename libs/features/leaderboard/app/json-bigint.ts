/**
 * Map bigint token fields for JSON HTTP responses.
 * Safe integers stay numbers; out-of-range → string.
 */
export function bigintToJsonNumber(value: bigint): number | string {
  if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return value.toString();
}

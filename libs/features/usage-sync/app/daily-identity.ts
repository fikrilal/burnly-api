/**
 * Desktop daily identity scheme (versioned).
 * @see docs/adr/0021-usage-sync-identity-and-devices.md
 */
export function buildDailyIdentityKey(params: {
  sourceKey: string;
  identityVersion: number;
  aggregationTimezone: string;
  usageDate: string;
}): string {
  return `${params.sourceKey}:daily:v${params.identityVersion}:${params.aggregationTimezone}:${params.usageDate}`;
}

const USAGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUsageDateString(value: string): boolean {
  if (!USAGE_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map((part) => Number(part));
  if (y === undefined || m === undefined || d === undefined) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Calendar date at UTC midnight for Postgres DATE columns. */
export function usageDateToUtcDate(usageDate: string): Date {
  const [y, m, d] = usageDate.split('-').map((part) => Number(part));
  return new Date(Date.UTC(y!, m! - 1, d!));
}

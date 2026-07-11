/**
 * Desktop daily identity scheme (versioned).
 * @see docs/adr/0021-usage-sync-identity-and-devices.md
 */

export {
  isUsageDateString,
  usageDateToUtcDate,
  utcDateToUsageDateString,
  addUsageDateDays,
} from '../domain/calendar-date';

export function buildDailyIdentityKey(params: {
  sourceKey: string;
  identityVersion: number;
  aggregationTimezone: string;
  usageDate: string;
}): string {
  return `${params.sourceKey}:daily:v${params.identityVersion}:${params.aggregationTimezone}:${params.usageDate}`;
}

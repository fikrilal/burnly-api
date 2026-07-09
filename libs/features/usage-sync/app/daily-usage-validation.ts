import { parseRfc3339ToDate } from '../domain/calendar-date';
import { buildDailyIdentityKey, isUsageDateString } from './daily-identity';
import type {
  UsageCostKind,
  UsageCostStatus,
  UsageDataQuality,
  UsageRecordState,
} from './usage-sync.types';

export type ValidationIssue = Readonly<{ field: string; message: string }>;

export type ParsedCost = Readonly<{
  status: UsageCostStatus;
  kind: UsageCostKind | null;
  amountMicros: bigint | null;
  currency: string | null;
}>;

const CURRENCY_RE = /^[A-Z]{3}$/;

export function isCostStatus(value: unknown): value is UsageCostStatus {
  if (typeof value !== 'string') return false;
  switch (value) {
    case 'available':
    case 'estimated':
    case 'not_applicable':
    case 'unavailable':
      return true;
    default:
      return false;
  }
}

export function isCostKind(value: unknown): value is UsageCostKind {
  if (typeof value !== 'string') return false;
  switch (value) {
    case 'source_reported':
    case 'collector_calculated':
    case 'collector_mixed':
    case 'burnly_calculated':
    case 'unknown':
      return true;
    default:
      return false;
  }
}

export function isRecordState(value: unknown): value is UsageRecordState {
  if (typeof value !== 'string') return false;
  switch (value) {
    case 'active':
    case 'missing':
    case 'removed':
      return true;
    default:
      return false;
  }
}

export function isDataQuality(value: unknown): value is UsageDataQuality {
  if (typeof value !== 'string') return false;
  switch (value) {
    case 'complete':
    case 'partial':
      return true;
    default:
      return false;
  }
}

export function toUnknownRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    result[key] = Reflect.get(value, key);
  }
  return result;
}

/**
 * Convert JSON number/null/undefined to bigint | null.
 * Rejects non-integers and values outside Number.MAX_SAFE_INTEGER.
 */
export function parseTokenCount(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
  options?: { required?: boolean },
): bigint | null | undefined {
  if (value === undefined) {
    if (options?.required) {
      issues.push({ field, message: 'required' });
    }
    return undefined;
  }
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    issues.push({ field, message: 'must be an integer or null' });
    return undefined;
  }
  if (value < 0) {
    issues.push({ field, message: 'must be >= 0' });
    return undefined;
  }
  if (!Number.isSafeInteger(value)) {
    issues.push({ field, message: 'must be a safe integer' });
    return undefined;
  }
  return BigInt(value);
}

export function parseClientRevision(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): bigint | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    issues.push({ field, message: 'must be an integer' });
    return undefined;
  }
  if (value < 1) {
    issues.push({ field, message: 'must be >= 1' });
    return undefined;
  }
  if (!Number.isSafeInteger(value)) {
    issues.push({ field, message: 'must be a safe integer' });
    return undefined;
  }
  return BigInt(value);
}

export function validateParentCost(
  cost: unknown,
  fieldPrefix: string,
  issues: ValidationIssue[],
): ParsedCost | undefined {
  const obj = toUnknownRecord(cost);
  if (!obj) {
    issues.push({ field: fieldPrefix, message: 'must be an object' });
    return undefined;
  }
  const statusRaw = obj.status;
  if (!isCostStatus(statusRaw)) {
    issues.push({ field: `${fieldPrefix}.status`, message: 'invalid cost status' });
    return undefined;
  }

  const kindRaw = obj.kind;
  if (!isCostKind(kindRaw)) {
    issues.push({ field: `${fieldPrefix}.kind`, message: 'invalid or missing cost kind' });
    return undefined;
  }

  const amountRaw = obj.amountMicros;
  const currencyRaw = obj.currency;

  if (statusRaw === 'available' || statusRaw === 'estimated') {
    const amount = parseTokenCount(amountRaw, `${fieldPrefix}.amountMicros`, issues, {
      required: true,
    });
    if (typeof currencyRaw !== 'string' || !CURRENCY_RE.test(currencyRaw)) {
      issues.push({
        field: `${fieldPrefix}.currency`,
        message: 'must be a 3-letter ISO 4217 code',
      });
      return undefined;
    }
    if (amount === undefined || amount === null) return undefined;
    return {
      status: statusRaw,
      kind: kindRaw,
      amountMicros: amount,
      currency: currencyRaw,
    };
  }

  if (amountRaw !== undefined && amountRaw !== null) {
    issues.push({
      field: `${fieldPrefix}.amountMicros`,
      message: 'must be null when cost is unavailable or not applicable',
    });
  }
  if (currencyRaw !== undefined && currencyRaw !== null) {
    issues.push({
      field: `${fieldPrefix}.currency`,
      message: 'must be null when cost is unavailable or not applicable',
    });
  }
  return {
    status: statusRaw,
    kind: kindRaw,
    amountMicros: null,
    currency: null,
  };
}

export function validateModelCost(
  cost: unknown,
  fieldPrefix: string,
  issues: ValidationIssue[],
): ParsedCost | undefined {
  const obj = toUnknownRecord(cost);
  if (!obj) {
    issues.push({ field: fieldPrefix, message: 'must be an object' });
    return undefined;
  }
  const statusRaw = obj.status;
  if (!isCostStatus(statusRaw)) {
    issues.push({ field: `${fieldPrefix}.status`, message: 'invalid cost status' });
    return undefined;
  }

  let kind: UsageCostKind | null = null;
  if (obj.kind !== undefined && obj.kind !== null) {
    if (!isCostKind(obj.kind)) {
      issues.push({ field: `${fieldPrefix}.kind`, message: 'invalid cost kind' });
      return undefined;
    }
    kind = obj.kind;
  }

  const amountRaw = obj.amountMicros;
  const currencyRaw = obj.currency;

  if (statusRaw === 'available' || statusRaw === 'estimated') {
    if (kind === null) {
      kind = 'unknown';
    }
    const amount = parseTokenCount(amountRaw, `${fieldPrefix}.amountMicros`, issues, {
      required: true,
    });
    if (typeof currencyRaw !== 'string' || !CURRENCY_RE.test(currencyRaw)) {
      issues.push({
        field: `${fieldPrefix}.currency`,
        message: 'must be a 3-letter ISO 4217 code',
      });
      return undefined;
    }
    if (amount === undefined || amount === null) return undefined;
    return { status: statusRaw, kind, amountMicros: amount, currency: currencyRaw };
  }

  if (amountRaw !== undefined && amountRaw !== null) {
    issues.push({
      field: `${fieldPrefix}.amountMicros`,
      message: 'must be null when cost is unavailable or not applicable',
    });
  }
  if (currencyRaw !== undefined && currencyRaw !== null) {
    issues.push({
      field: `${fieldPrefix}.currency`,
      message: 'must be null when cost is unavailable or not applicable',
    });
  }
  return {
    status: statusRaw,
    kind,
    amountMicros: null,
    currency: null,
  };
}

export function validateIdentityKey(params: {
  identityKey: string;
  sourceKey: string;
  identityVersion: number;
  aggregationTimezone: string;
  usageDate: string;
  fieldPrefix: string;
  issues: ValidationIssue[];
}): boolean {
  const expected = buildDailyIdentityKey({
    sourceKey: params.sourceKey,
    identityVersion: params.identityVersion,
    aggregationTimezone: params.aggregationTimezone,
    usageDate: params.usageDate,
  });
  if (params.identityKey !== expected) {
    params.issues.push({
      field: `${params.fieldPrefix}.identityKey`,
      message: `must equal reconstructed key "${expected}"`,
    });
    return false;
  }
  return true;
}

export function validateWindow(params: {
  startDate: string;
  endDate: string;
  scope: string;
  issues: ValidationIssue[];
}): boolean {
  let ok = true;
  if (!isUsageDateString(params.startDate)) {
    params.issues.push({ field: 'window.startDate', message: 'must be YYYY-MM-DD' });
    ok = false;
  }
  if (!isUsageDateString(params.endDate)) {
    params.issues.push({ field: 'window.endDate', message: 'must be YYYY-MM-DD' });
    ok = false;
  }
  if (params.scope !== 'rolling') {
    params.issues.push({ field: 'window.scope', message: 'must be "rolling" in v1' });
    ok = false;
  }
  if (ok && params.startDate > params.endDate) {
    params.issues.push({ field: 'window', message: 'startDate must be <= endDate' });
    ok = false;
  }
  return ok;
}

export function parseIsoDateTime(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
  options?: { required?: boolean; allowNull?: boolean },
): Date | null | undefined {
  if (value === undefined) {
    if (options?.required) {
      issues.push({ field, message: 'required' });
    }
    return undefined;
  }
  if (value === null) {
    if (options?.allowNull) return null;
    issues.push({ field, message: 'must not be null' });
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ field, message: 'must be an RFC 3339 timestamp string' });
    return undefined;
  }
  const parsed = parseRfc3339ToDate(value);
  if (!parsed) {
    issues.push({ field, message: 'must be a valid RFC 3339 timestamp' });
    return undefined;
  }
  return parsed;
}

export { isUsageDateString };

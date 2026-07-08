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

const COST_STATUSES = new Set<UsageCostStatus>([
  'available',
  'estimated',
  'not_applicable',
  'unavailable',
]);

const COST_KINDS = new Set<UsageCostKind>([
  'source_reported',
  'collector_calculated',
  'collector_mixed',
  'burnly_calculated',
  'unknown',
]);

const RECORD_STATES = new Set<UsageRecordState>(['active', 'missing', 'removed']);
const DATA_QUALITIES = new Set<UsageDataQuality>(['complete', 'partial']);

const CURRENCY_RE = /^[A-Z]{3}$/;

export function isCostStatus(value: unknown): value is UsageCostStatus {
  return typeof value === 'string' && COST_STATUSES.has(value as UsageCostStatus);
}

export function isCostKind(value: unknown): value is UsageCostKind {
  return typeof value === 'string' && COST_KINDS.has(value as UsageCostKind);
}

export function isRecordState(value: unknown): value is UsageRecordState {
  return typeof value === 'string' && RECORD_STATES.has(value as UsageRecordState);
}

export function isDataQuality(value: unknown): value is UsageDataQuality {
  return typeof value === 'string' && DATA_QUALITIES.has(value as UsageDataQuality);
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
  if (cost === null || typeof cost !== 'object' || Array.isArray(cost)) {
    issues.push({ field: fieldPrefix, message: 'must be an object' });
    return undefined;
  }
  const obj = cost as Record<string, unknown>;
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

  // not_applicable / unavailable → amount and currency must be null/omitted
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
  if (cost === null || typeof cost !== 'object' || Array.isArray(cost)) {
    issues.push({ field: fieldPrefix, message: 'must be an object' });
    return undefined;
  }
  const obj = cost as Record<string, unknown>;
  const statusRaw = obj.status;
  if (!isCostStatus(statusRaw)) {
    issues.push({ field: `${fieldPrefix}.status`, message: 'invalid cost status' });
    return undefined;
  }

  // Model costs: estimated | unavailable preferred; allow same pairing rules
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
      // default kind when amount present
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
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    issues.push({ field, message: 'must be a valid RFC 3339 timestamp' });
    return undefined;
  }
  return new Date(ms);
}

export { isUsageDateString };

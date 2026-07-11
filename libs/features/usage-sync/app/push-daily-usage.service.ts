import type { Clock } from '../../../shared/time';
import { ErrorCode } from '../../../shared/error-codes';
import { usageDateToUtcDate } from './daily-identity';
import {
  isDataQuality,
  isRecordState,
  isUsageDateString,
  parseClientRevision,
  parseIsoDateTime,
  parseTokenCount,
  validateIdentityKey,
  validateModelCost,
  validateParentCost,
  toUnknownRecord,
  validateWindow,
  type ValidationIssue,
} from './daily-usage-validation';
import type { DailyUsageFactsRepository } from './ports/daily-usage-facts.repository';
import type { SyncDevicesRepository } from './ports/sync-devices.repository';
import { SyncErrorCode } from './usage-sync.error-codes';
import { UsageSyncError } from './usage-sync.errors';
import { MAX_FACTS_PER_BATCH, MAX_MODELS_PER_FACT } from './usage-sync.limits';
import type {
  DailyModelUsageWrite,
  SyncBatchScope,
  UpsertDailyUsageFactInput,
  UsageRecordState,
} from './usage-sync.types';
import { isSyncBatchScope } from './usage-sync.types';

export const SUPPORTED_SYNC_CONTRACT_VERSION = 1;
export { MAX_FACTS_PER_BATCH, MAX_MODELS_PER_FACT } from './usage-sync.limits';

export type PushDailyUsageCommand = Readonly<{
  userId: string;
  contractVersion: number;
  clientDeviceId: string;
  appVersion: string;
  reportingTimezone: string;
  clientRevision: number;
  window: Readonly<{
    startDate: string;
    endDate: string;
    scope: string;
  }>;
  facts: ReadonlyArray<Record<string, unknown>>;
  clientBatchId?: string | null;
  traceId?: string | null;
}>;

export type PushDailyUsageResult = Readonly<{
  clientDeviceId: string;
  acceptedAt: string;
  clientRevision: number;
  window: Readonly<{
    startDate: string;
    endDate: string;
    scope: SyncBatchScope;
  }>;
  counts: Readonly<{
    received: number;
    upserted: number;
    removed: number;
    unchanged: number;
    rejected: number;
  }>;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return toUnknownRecord(value);
}

function optionalStringField(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value;
  issues.push({ field, message: 'must be string or null' });
  return undefined;
}

function parseFact(
  raw: Record<string, unknown>,
  index: number,
  params: {
    userId: string;
    deviceId: string;
    clientRevision: bigint;
    syncedAt: Date;
  },
  issues: ValidationIssue[],
): { input: UpsertDailyUsageFactInput; recordState: UsageRecordState } | undefined {
  const prefix = `facts[${index}]`;
  let ok = true;

  const identityKey = raw.identityKey;
  const sourceKey = raw.sourceKey;
  const identityVersion = raw.identityVersion;
  const usageDate = raw.usageDate;
  const aggregationTimezone = raw.aggregationTimezone;

  if (typeof identityKey !== 'string' || identityKey.trim() === '') {
    issues.push({ field: `${prefix}.identityKey`, message: 'required string' });
    ok = false;
  }
  if (typeof sourceKey !== 'string' || sourceKey.trim() === '') {
    issues.push({ field: `${prefix}.sourceKey`, message: 'required string' });
    ok = false;
  }
  if (
    typeof identityVersion !== 'number' ||
    !Number.isInteger(identityVersion) ||
    identityVersion < 1
  ) {
    issues.push({ field: `${prefix}.identityVersion`, message: 'must be integer >= 1' });
    ok = false;
  }
  if (typeof usageDate !== 'string' || !isUsageDateString(usageDate)) {
    issues.push({ field: `${prefix}.usageDate`, message: 'must be YYYY-MM-DD' });
    ok = false;
  }
  if (typeof aggregationTimezone !== 'string' || aggregationTimezone.trim() === '') {
    issues.push({ field: `${prefix}.aggregationTimezone`, message: 'required string' });
    ok = false;
  }

  if (
    ok &&
    typeof identityKey === 'string' &&
    typeof sourceKey === 'string' &&
    typeof identityVersion === 'number' &&
    typeof usageDate === 'string' &&
    typeof aggregationTimezone === 'string'
  ) {
    if (
      !validateIdentityKey({
        identityKey,
        sourceKey: sourceKey.trim(),
        identityVersion,
        aggregationTimezone: aggregationTimezone.trim(),
        usageDate,
        fieldPrefix: prefix,
        issues,
      })
    ) {
      ok = false;
    }
  }

  const totalTokens = parseTokenCount(raw.totalTokens, `${prefix}.totalTokens`, issues, {
    required: true,
  });
  const inputTokens = parseTokenCount(raw.inputTokens, `${prefix}.inputTokens`, issues);
  const outputTokens = parseTokenCount(raw.outputTokens, `${prefix}.outputTokens`, issues);
  const cacheCreationTokens = parseTokenCount(
    raw.cacheCreationTokens,
    `${prefix}.cacheCreationTokens`,
    issues,
  );
  const cacheReadTokens = parseTokenCount(raw.cacheReadTokens, `${prefix}.cacheReadTokens`, issues);
  const unclassifiedTokens = parseTokenCount(
    raw.unclassifiedTokens,
    `${prefix}.unclassifiedTokens`,
    issues,
  );

  if (totalTokens === undefined || totalTokens === null) ok = false;

  const cost = validateParentCost(raw.cost, `${prefix}.cost`, issues);
  if (!cost) ok = false;

  if (!isDataQuality(raw.dataQuality)) {
    issues.push({ field: `${prefix}.dataQuality`, message: 'invalid dataQuality' });
    ok = false;
  }
  if (!isRecordState(raw.recordState)) {
    issues.push({ field: `${prefix}.recordState`, message: 'invalid recordState' });
    ok = false;
  }

  const firstSeenAt = parseIsoDateTime(raw.firstSeenAt, `${prefix}.firstSeenAt`, issues, {
    required: true,
  });
  const lastSeenAt = parseIsoDateTime(raw.lastSeenAt, `${prefix}.lastSeenAt`, issues, {
    required: true,
  });
  const removedAt = parseIsoDateTime(raw.removedAt, `${prefix}.removedAt`, issues, {
    allowNull: true,
  });

  if (firstSeenAt === undefined || lastSeenAt === undefined) ok = false;

  if (isRecordState(raw.recordState) && raw.recordState === 'removed') {
    if (removedAt === undefined || removedAt === null) {
      issues.push({
        field: `${prefix}.removedAt`,
        message: 'required when recordState is removed',
      });
      ok = false;
    }
  }

  const modelsRaw = raw.models;
  if (!Array.isArray(modelsRaw)) {
    issues.push({ field: `${prefix}.models`, message: 'must be an array' });
    ok = false;
  } else if (modelsRaw.length > MAX_MODELS_PER_FACT) {
    // Collected as issue; service maps pure over-size to SYNC_PAYLOAD_TOO_LARGE after loop.
    issues.push({
      field: `${prefix}.models`,
      message: `at most ${MAX_MODELS_PER_FACT} models per fact`,
      // marker consumed below via field name + message pattern
    });
    ok = false;
  }

  const models: DailyModelUsageWrite[] = [];
  if (Array.isArray(modelsRaw)) {
    for (let mi = 0; mi < modelsRaw.length; mi += 1) {
      const modelObj = asRecord(modelsRaw[mi]);
      const mPrefix = `${prefix}.models[${mi}]`;
      if (!modelObj) {
        issues.push({ field: mPrefix, message: 'must be an object' });
        ok = false;
        continue;
      }

      const modelCost = validateModelCost(modelObj.cost, `${mPrefix}.cost`, issues);
      if (!modelCost) {
        ok = false;
        continue;
      }

      const mTotal = parseTokenCount(modelObj.totalTokens, `${mPrefix}.totalTokens`, issues);
      const mIn = parseTokenCount(modelObj.inputTokens, `${mPrefix}.inputTokens`, issues);
      const mOut = parseTokenCount(modelObj.outputTokens, `${mPrefix}.outputTokens`, issues);
      const mCc = parseTokenCount(
        modelObj.cacheCreationTokens,
        `${mPrefix}.cacheCreationTokens`,
        issues,
      );
      const mCr = parseTokenCount(modelObj.cacheReadTokens, `${mPrefix}.cacheReadTokens`, issues);

      const rawModelId = optionalStringField(modelObj.rawModelId, `${mPrefix}.rawModelId`, issues);
      const displayName = optionalStringField(
        modelObj.displayName,
        `${mPrefix}.displayName`,
        issues,
      );
      const providerKey = optionalStringField(
        modelObj.providerKey,
        `${mPrefix}.providerKey`,
        issues,
      );
      if (
        (modelObj.rawModelId !== undefined &&
          modelObj.rawModelId !== null &&
          typeof modelObj.rawModelId !== 'string') ||
        (modelObj.displayName !== undefined &&
          modelObj.displayName !== null &&
          typeof modelObj.displayName !== 'string') ||
        (modelObj.providerKey !== undefined &&
          modelObj.providerKey !== null &&
          typeof modelObj.providerKey !== 'string')
      ) {
        ok = false;
      }

      models.push({
        rawModelId,
        displayName,
        providerKey,
        inputTokens: mIn === undefined ? undefined : mIn,
        outputTokens: mOut === undefined ? undefined : mOut,
        cacheCreationTokens: mCc === undefined ? undefined : mCc,
        cacheReadTokens: mCr === undefined ? undefined : mCr,
        totalTokens: mTotal === undefined ? undefined : mTotal,
        costStatus: modelCost.status,
        costKind: modelCost.kind,
        costAmountMicros: modelCost.amountMicros,
        costCurrency: modelCost.currency,
      });
    }
  }

  if (!ok || totalTokens === undefined || totalTokens === null || !cost) return undefined;
  if (!isDataQuality(raw.dataQuality) || !isRecordState(raw.recordState)) return undefined;
  if (!(firstSeenAt instanceof Date) || !(lastSeenAt instanceof Date)) return undefined;
  if (typeof sourceKey !== 'string' || typeof identityKey !== 'string') return undefined;
  if (typeof identityVersion !== 'number' || typeof usageDate !== 'string') return undefined;
  if (typeof aggregationTimezone !== 'string') return undefined;

  return {
    recordState: raw.recordState,
    input: {
      userId: params.userId,
      deviceId: params.deviceId,
      sourceKey: sourceKey.trim(),
      identityKey,
      identityVersion,
      usageDate: usageDateToUtcDate(usageDate),
      aggregationTimezone: aggregationTimezone.trim(),
      inputTokens: inputTokens === undefined ? undefined : inputTokens,
      outputTokens: outputTokens === undefined ? undefined : outputTokens,
      cacheCreationTokens: cacheCreationTokens === undefined ? undefined : cacheCreationTokens,
      cacheReadTokens: cacheReadTokens === undefined ? undefined : cacheReadTokens,
      totalTokens,
      unclassifiedTokens: unclassifiedTokens === undefined ? undefined : unclassifiedTokens,
      costStatus: cost.status,
      costKind: cost.kind ?? 'unknown',
      costAmountMicros: cost.amountMicros,
      costCurrency: cost.currency,
      dataQuality: raw.dataQuality,
      recordState: raw.recordState,
      clientFirstSeenAt: firstSeenAt,
      clientLastSeenAt: lastSeenAt,
      clientRemovedAt: removedAt === undefined ? null : removedAt,
      clientRevision: params.clientRevision,
      syncedAt: params.syncedAt,
      models,
    },
  };
}

export class PushDailyUsageService {
  constructor(
    private readonly devices: SyncDevicesRepository,
    private readonly facts: DailyUsageFactsRepository,
    private readonly clock: Clock,
  ) {}

  async push(command: PushDailyUsageCommand): Promise<PushDailyUsageResult> {
    if (command.contractVersion !== SUPPORTED_SYNC_CONTRACT_VERSION) {
      throw new UsageSyncError({
        status: 400,
        code: SyncErrorCode.SYNC_CONTRACT_UNSUPPORTED,
        message: `Unsupported contractVersion ${command.contractVersion}; supported: ${SUPPORTED_SYNC_CONTRACT_VERSION}`,
      });
    }

    const clientDeviceId = command.clientDeviceId.trim();
    if (clientDeviceId.length === 0 || clientDeviceId.length > 128) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Invalid clientDeviceId',
        issues: [{ field: 'clientDeviceId', message: 'must be 1–128 characters' }],
      });
    }

    const issues: ValidationIssue[] = [];
    validateWindow({
      startDate: command.window.startDate,
      endDate: command.window.endDate,
      scope: command.window.scope,
      issues,
    });

    if (typeof command.appVersion !== 'string' || command.appVersion.trim() === '') {
      issues.push({ field: 'appVersion', message: 'required' });
    }
    if (typeof command.reportingTimezone !== 'string' || command.reportingTimezone.trim() === '') {
      issues.push({ field: 'reportingTimezone', message: 'required' });
    }

    const clientRevision = parseClientRevision(command.clientRevision, 'clientRevision', issues);

    if (!Array.isArray(command.facts)) {
      issues.push({ field: 'facts', message: 'must be an array' });
    } else if (command.facts.length > MAX_FACTS_PER_BATCH) {
      throw new UsageSyncError({
        status: 400,
        code: SyncErrorCode.SYNC_PAYLOAD_TOO_LARGE,
        message: `At most ${MAX_FACTS_PER_BATCH} facts per request`,
        issues: [
          {
            field: 'facts',
            message: `at most ${MAX_FACTS_PER_BATCH} facts per request`,
          },
        ],
      });
    }

    // Fail window/meta validation before device lookup so codes stay clear
    if (issues.length > 0) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues,
      });
    }

    if (!isSyncBatchScope(command.window.scope)) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues: [
          {
            field: 'window.scope',
            message: 'must be "full", "incremental", or deprecated "rolling"',
          },
        ],
      });
    }
    const windowScope: SyncBatchScope = command.window.scope;

    const device = await this.devices.findByUserAndClientDeviceId(command.userId, clientDeviceId);
    if (!device) {
      throw new UsageSyncError({
        status: 404,
        code: SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
        message: 'Sync device not found',
      });
    }

    const syncedAt = this.clock.now();
    const revision = clientRevision!;
    const parsedFacts: Array<{ input: UpsertDailyUsageFactInput; recordState: UsageRecordState }> =
      [];
    const factIssues: ValidationIssue[] = [];
    let identityInvalid = false;

    for (let i = 0; i < command.facts.length; i += 1) {
      const raw = asRecord(command.facts[i]);
      if (!raw) {
        factIssues.push({ field: `facts[${i}]`, message: 'must be an object' });
        continue;
      }
      const beforeLen = factIssues.length;
      const parsed = parseFact(
        raw,
        i,
        {
          userId: command.userId,
          deviceId: device.id,
          clientRevision: revision,
          syncedAt,
        },
        factIssues,
      );
      const newIssues = factIssues.slice(beforeLen);
      if (newIssues.some((issue) => issue.field.endsWith('.identityKey'))) {
        identityInvalid = true;
      }
      if (parsed) parsedFacts.push(parsed);
    }

    if (factIssues.length > 0) {
      const payloadTooLarge = factIssues.some(
        (issue) =>
          issue.field.endsWith('.models') &&
          issue.message.includes(`at most ${MAX_MODELS_PER_FACT}`),
      );
      throw new UsageSyncError({
        status: 400,
        code: payloadTooLarge
          ? SyncErrorCode.SYNC_PAYLOAD_TOO_LARGE
          : identityInvalid
            ? SyncErrorCode.SYNC_IDENTITY_INVALID
            : ErrorCode.VALIDATION_FAILED,
        message: payloadTooLarge
          ? `At most ${MAX_MODELS_PER_FACT} models per fact`
          : identityInvalid
            ? 'Invalid identity key'
            : 'Validation failed',
        issues: factIssues,
      });
    }

    // All-or-nothing: only commit when every fact parsed (or empty batch)
    if (parsedFacts.length !== command.facts.length) {
      throw new UsageSyncError({
        status: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        issues: factIssues.length > 0 ? factIssues : [{ field: 'facts', message: 'invalid facts' }],
      });
    }

    const commit = await this.facts.commitDailyUsagePush({
      deviceId: device.id,
      syncedAt,
      clientRevision: revision,
      appVersion: command.appVersion.trim(),
      reportingTimezone: command.reportingTimezone.trim(),
      facts: parsedFacts.map((f) => f.input),
      factRecordStates: parsedFacts.map((f) => f.recordState),
      batch: {
        userId: command.userId,
        clientBatchId: command.clientBatchId ?? null,
        contractVersion: command.contractVersion,
        appVersion: command.appVersion.trim(),
        windowStartDate: usageDateToUtcDate(command.window.startDate),
        windowEndDate: usageDateToUtcDate(command.window.endDate),
        windowScope,
        traceId: command.traceId ?? null,
      },
    });

    return {
      clientDeviceId,
      acceptedAt: syncedAt.toISOString(),
      clientRevision: Number(revision),
      window: {
        startDate: command.window.startDate,
        endDate: command.window.endDate,
        scope: windowScope,
      },
      counts: commit.counts,
    };
  }
}

# Engineering Proposal: Usage Sync Phase B — Persistence

## Status

**Accepted and implemented** (Phase B complete on `development`).

Date: 2026-07-09  
Branch: `development`  
Parent plan: `docs/planning/desktop-collect-implementation-plan.md` (Phase B)  
Exec plan: `docs/exec-plans/completed/2026-07-09_usage-sync-01-schema.md`  
Binding ADRs:

- `docs/adr/0020-daily-usage-cloud-projection.md`
- `docs/adr/0021-usage-sync-identity-and-devices.md`

Contract (field names for later HTTP):  
`docs/planning/desktop-collect-api-requirements.md`

Schema + thin repositories shipped; HTTP collect APIs remain Phase C.

## Goal

Add Postgres schema so burnly-api can later:

1. Register a desktop install as a sync device.
2. Upsert daily usage facts + model breakdowns per `(user, device, identityKey)`.
3. Audit push batches (support + debugging).
4. Cascade / wipe cleanly on user account deletion.

## Non-goals (Phase B)

| Out of scope                                      | Why                                           |
| ------------------------------------------------- | --------------------------------------------- |
| HTTP controllers / DTOs / OpenAPI routes          | Phase C                                       |
| Identity reconstruction validation logic          | Phase C (domain), may land pure helpers later |
| Idempotency-Key middleware wiring                 | Phase D (platform already exists)             |
| Account-deletion job changes                      | Phase D (schema must allow cascade now)       |
| Web read query endpoints                          | Separate plan                                 |
| Storing sessions, projects, paths, collector JSON | Forbidden by ADR 0020                         |

## Recommended Phase B scope cut

**Propose: B-schema + thin repository ports/adapters (no Nest HTTP module wiring).**

| Include                                                         | Defer                                  |
| --------------------------------------------------------------- | -------------------------------------- |
| Prisma enums + models + migration                               | Feature Nest module in `AppModule`     |
| `User` relations for cascade                                    | Controllers                            |
| Repository **ports** under `libs/features/usage-sync/app/ports` | Use-case services that call validation |
| Prisma repository implementing upsert primitives                | Full batch orchestration               |
| Unit/integration tests for unique constraints if cheap          | E2E collect HTTP                       |

Rationale: Phase C should not redesign uniqueness mid-flight. Thin ports prove the
schema is usable without shipping incomplete APIs.

**Alternative (lighter):** migration + models only, repositories in Phase C.  
Acceptable if you want the smallest Phase B PR; slightly higher risk of schema
tweaks during Phase C.

## Domain entities (logical)

```text
User
 └── SyncDevice              1..* per user (install)
      ├── DailyUsageFact     many per device
      │    └── DailyModelUsageFact
      └── SyncBatch          many (push audit)
```

Multi-device reporting (future reads): sum active facts across devices for a user
(ADR 0021). Schema enables that; Phase B does not implement report queries.

## Naming

| Layer        | Convention                                                               |
| ------------ | ------------------------------------------------------------------------ |
| Prisma model | PascalCase singular: `SyncDevice`, `DailyUsageFact`, …                   |
| Table        | Prisma default `SyncDevice` → map to snake tables if we prefer SQL style |
| Columns      | Prisma camelCase → `@map` snake_case for SQL readability                 |

**Proposal:** use `@map` / `@@map` to **snake_case tables and columns** so raw SQL
and ops stay readable, matching common Postgres style. Existing auth models in
this repo mostly use Prisma default camelCase table names without `@map`.

**Decision needed (pick one):**

| Option                                 | Choice                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| **A (consistent with current schema)** | No `@map`; Prisma defaults (`SyncDevice`, `userId`, …) like `User` / `Session` |
| **B (SQL-friendly)**                   | Explicit `@@map("sync_devices")` + column maps                                 |

**Recommendation: Option A** — stay consistent with existing `schema.prisma` and
avoid a mixed mapping style in one file. Revisit only if ops strongly prefer SQL
names.

Feature folder: `libs/features/usage-sync/` (matches ADR 0020).

## Enums

```prisma
enum SyncDevicePlatform {
  linux
  macos
  windows
}

enum UsageRecordState {
  active
  missing
  removed
}

enum UsageCostStatus {
  available
  estimated
  not_applicable
  unavailable
}

enum UsageCostKind {
  source_reported
  collector_calculated
  collector_mixed
  burnly_calculated
  unknown
}

enum UsageDataQuality {
  complete
  partial
  // extend later if desktop adds values; unknown strings rejected at API until listed
}

enum SyncBatchScope {
  rolling
  // full reserved; not implemented for wipe semantics in v1
}

enum SyncBatchStatus {
  accepted
  rejected
}
```

Notes:

- Desktop uses lowercase string enums in JSON (`active`, `estimated`, …). Prisma
  enum **values** should match those strings for simpler mapping (Prisma allows
  lowercase enum members).
- `SyncDevicePlatform` matches collect body `linux | macos | windows`.
- Cost pairing rules are **app-layer**, not CHECK constraints in v1 (keep migration
  simple). Optional later: DB CHECK for amount nullability vs status.

## Proposed models

### `SyncDevice`

| Field                     | Type                 | Notes                                  |
| ------------------------- | -------------------- | -------------------------------------- |
| `id`                      | `Uuid` PK            | `gen_random_uuid()`                    |
| `userId`                  | `Uuid` FK → `User`   | `onDelete: Cascade`                    |
| `clientDeviceId`          | `String`             | desktop install id; **not** Session PK |
| `displayName`             | `String?`            | optional hostname label                |
| `platform`                | `SyncDevicePlatform` | required                               |
| `appVersion`              | `String`             | last seen desktop semver               |
| `reportingTimezone`       | `String`             | last known IANA tz                     |
| `lastSyncAt`              | `DateTime?`          | last successful daily-usage accept     |
| `lastClientRevision`      | `BigInt?`            | last accepted push revision for device |
| `createdAt` / `updatedAt` | `DateTime`           | standard                               |

**Constraints:**

```text
UNIQUE (userId, clientDeviceId)
INDEX (userId)
INDEX (userId, lastSyncAt)
```

**Length bounds (enforce in API; optional DB):**

- `clientDeviceId` ≤ 128 (`@db.VarChar(128)`)
- `displayName` ≤ 128
- `appVersion` ≤ 64
- `reportingTimezone` ≤ 64

**Relation to auth `Session.deviceId`:** same client string **should** be sent on
login for correlation, but **no FK** between `Session` and `SyncDevice` in v1
(sessions can exist without sync; sync device can be registered after login).

---

### `DailyUsageFact`

Parent daily aggregate for one device stream.

| Field                     | Type                     | Notes                               |
| ------------------------- | ------------------------ | ----------------------------------- |
| `id`                      | `Uuid` PK                | server only                         |
| `userId`                  | `Uuid`                   | denormalized for queries + deletion |
| `deviceId`                | `Uuid` FK → `SyncDevice` | `onDelete: Cascade`                 |
| `sourceKey`               | `String`                 | e.g. `claude-code`                  |
| `identityKey`             | `String`                 | full deterministic key              |
| `identityVersion`         | `Int`                    | currently `1`                       |
| `usageDate`               | `Date`                   | `@db.Date` calendar date            |
| `aggregationTimezone`     | `String`                 | IANA                                |
| `inputTokens`             | `BigInt?`                | null = unavailable                  |
| `outputTokens`            | `BigInt?`                |                                     |
| `cacheCreationTokens`     | `BigInt?`                |                                     |
| `cacheReadTokens`         | `BigInt?`                |                                     |
| `totalTokens`             | `BigInt`                 | required, ≥ 0 (app-validated)       |
| `unclassifiedTokens`      | `BigInt?`                |                                     |
| `costStatus`              | `UsageCostStatus`        |                                     |
| `costKind`                | `UsageCostKind`          |                                     |
| `costAmountMicros`        | `BigInt?`                | null when unavailable / n/a         |
| `costCurrency`            | `String?`                | ISO 4217; `@db.Char(3)` when set    |
| `dataQuality`             | `UsageDataQuality`       |                                     |
| `recordState`             | `UsageRecordState`       | soft remove via `removed`           |
| `clientFirstSeenAt`       | `DateTime`               | from client RFC3339                 |
| `clientLastSeenAt`        | `DateTime`               | conflict helper                     |
| `clientRemovedAt`         | `DateTime?`              | when removed                        |
| `clientRevision`          | `BigInt`                 | revision that last wrote this row   |
| `syncedAt`                | `DateTime`               | server receive time for last write  |
| `createdAt` / `updatedAt` | `DateTime`               |                                     |

**Constraints:**

```text
UNIQUE (userId, deviceId, identityKey)

INDEX (userId, usageDate)
INDEX (userId, sourceKey, usageDate)
INDEX (userId, aggregationTimezone, usageDate)
INDEX (deviceId, usageDate)
INDEX (userId, recordState, usageDate)   -- future reads: exclude removed
```

**String bounds (proposal):**

- `identityKey` `@db.VarChar(512)`
- `sourceKey` `@db.VarChar(64)`
- `aggregationTimezone` `@db.VarChar(64)`

**Why `BigInt` for tokens:** desktop can grow beyond `Int32`; aligns with handoff
“integer tokens”; Prisma `BigInt` maps cleanly. App layer converts from JSON
numbers carefully (JS safe integer limits — document that API accepts number or
string if needed; for v1 JSON numbers within `Number.MAX_SAFE_INTEGER` is enough
for token counts).

**Soft delete:** use `recordState = removed` (+ `clientRemovedAt`), **not** a
generic `deletedAt` on this table. Keeps desktop semantics.

**No** store of: local SQLite id, project path, session id, raw collector blob.

---

### `DailyModelUsageFact`

Child breakdown under one daily parent.

| Field                     | Type              | Notes                                       |
| ------------------------- | ----------------- | ------------------------------------------- |
| `id`                      | `Uuid` PK         |                                             |
| `dailyUsageFactId`        | `Uuid` FK         | `onDelete: Cascade`                         |
| `userId`                  | `Uuid`            | denormalized for wipe queries               |
| `rawModelId`              | `String?`         | null = unknown-model bucket                 |
| `displayName`             | `String?`         | optional                                    |
| `providerKey`             | `String?`         | optional                                    |
| token fields              | `BigInt?`         | same null semantics                         |
| `totalTokens`             | `BigInt?`         | breakdown only                              |
| `costStatus`              | `UsageCostStatus` | desktop: estimated \| unavailable typically |
| `costKind`                | `UsageCostKind?`  | optional if only status set                 |
| `costAmountMicros`        | `BigInt?`         |                                             |
| `costCurrency`            | `String?`         |                                             |
| `createdAt` / `updatedAt` | `DateTime`        |                                             |

**Uniqueness for model children — important Postgres detail:**

Desired: one row per `(dailyUsageFactId, rawModelId)`, including **at most one
null `rawModelId`** (unknown bucket).

Standard `UNIQUE (dailyUsageFactId, rawModelId)` in Postgres allows **multiple
NULLs** for `rawModelId`, which is wrong for the unknown bucket.

**Proposal:**

1. Add `modelIdentityKey String` computed at write time:
   - if `rawModelId` present → use it (or a normalized form)
   - if null → sentinel `"\0unknown"` or `"__unknown__"` (document constant)
2. `UNIQUE (dailyUsageFactId, modelIdentityKey)`

Avoids partial unique index gymnastics and keeps Prisma-friendly uniqueness.

Alternative: raw SQL partial unique index:

```sql
UNIQUE (daily_usage_fact_id, raw_model_id) WHERE raw_model_id IS NOT NULL
UNIQUE (daily_usage_fact_id) WHERE raw_model_id IS NULL
```

**Recommendation: `modelIdentityKey` sentinel** for simpler Prisma upserts.

On parent upsert, Phase C will **delete + reinsert** children (scoped replace) or
use a transaction: deleteMany by parent id then createMany.

---

### `SyncBatch` (recommended, include in Phase B)

Audit each push attempt (accepted or rejected after auth).

| Field              | Type               | Notes                                     |
| ------------------ | ------------------ | ----------------------------------------- |
| `id`               | `Uuid` PK          |                                           |
| `userId`           | `Uuid` FK / denorm | cascade with user                         |
| `deviceId`         | `Uuid?` FK         | null if device missing / rejected early   |
| `clientBatchId`    | `String`           | mirrors Idempotency-Key / client batch id |
| `contractVersion`  | `Int`              |                                           |
| `clientRevision`   | `BigInt?`          | from body when parsed                     |
| `appVersion`       | `String?`          |                                           |
| `windowStartDate`  | `Date?`            |                                           |
| `windowEndDate`    | `Date?`            |                                           |
| `windowScope`      | `SyncBatchScope?`  |                                           |
| `status`           | `SyncBatchStatus`  | accepted / rejected                       |
| `recordsReceived`  | `Int`              |                                           |
| `recordsUpserted`  | `Int`              |                                           |
| `recordsRemoved`   | `Int`              |                                           |
| `recordsUnchanged` | `Int`              |                                           |
| `rejectCode`       | `String?`          | problem code if rejected                  |
| `traceId`          | `String?`          | request correlation                       |
| `createdAt`        | `DateTime`         |                                           |

**Constraints:**

```text
INDEX (userId, createdAt)
INDEX (deviceId, createdAt)
-- Optional uniqueness for client batch id per user/device:
UNIQUE (userId, deviceId, clientBatchId)  -- only for accepted? or all?
```

**Proposal on batch identity:**

- HTTP idempotency store (platform Redis/DB) remains the **replay** mechanism for
  identical requests.
- `SyncBatch` is **product audit**, not a second idempotency engine.
- Do **not** require unique `clientBatchId` in v1 unless we want natural
  dedupe without platform idempotency; prefer unique
  `(userId, deviceId, clientBatchId)` when `clientBatchId` present to avoid
  audit spam on retries **after** success logging once.

**Simplest v1:** no unique on `clientBatchId`; insert one row per accepted
handler completion; rely on Idempotency-Key for replay (Phase D). Avoids fighting
double-write edge cases in Phase B.

## Cascade and account deletion

| Parent           | Child                 | onDelete                  |
| ---------------- | --------------------- | ------------------------- |
| `User`           | `SyncDevice`          | Cascade                   |
| `User`           | `DailyUsageFact`      | Cascade (also via device) |
| `User`           | `SyncBatch`           | Cascade                   |
| `SyncDevice`     | `DailyUsageFact`      | Cascade                   |
| `DailyUsageFact` | `DailyModelUsageFact` | Cascade                   |

Denormalized `userId` on facts/batches enables:

```sql
DELETE FROM "DailyUsageFact" WHERE "userId" = $userId;
```

even if we later change device cascade strategy.

Phase D will extend the account-deletion worker to assert zero residual rows;
with FK cascade from `User`, deleting the user may already wipe children if
relations are complete. **Verify** whether account deletion hard-deletes the
`User` row or only marks `DELETED` — current product uses soft status
`UserStatus.DELETED` + cleanup job.

**Critical check for implementers:** if users are soft-deleted and the row
remains, **FK cascade does not run**. Phase B schema still needs an explicit
wipe path in Phase D against `userId`. Phase B only ensures tables are queryable
by `userId` for that wipe.

## Repository ports (if included)

Suggested ports (sketch, not final API):

```ts
// app/ports/sync-devices.repository.ts
upsertByClientDeviceId(input: UpsertSyncDeviceInput): Promise<SyncDeviceRecord>
findByUserAndClientDeviceId(userId, clientDeviceId): Promise<SyncDeviceRecord | null>

// app/ports/daily-usage-facts.repository.ts
/**
 * Transactional: upsert parent by (userId, deviceId, identityKey)
 * using revision/lastSeen policy; replace model children.
 */
upsertFactWithModels(input: UpsertDailyFactInput): Promise<UpsertFactResult>

// app/ports/sync-batches.repository.ts
create(input: CreateSyncBatchInput): Promise<void>
```

Phase B implements Prisma adapters + maybe a single repository integration test
using real Postgres (docker). No HTTP.

## Mapping: collect JSON → columns (reference)

| Request field       | Column                                       |
| ------------------- | -------------------------------------------- |
| `clientDeviceId`    | `SyncDevice.clientDeviceId`                  |
| `platform`          | `SyncDevice.platform`                        |
| `appVersion`        | `SyncDevice.appVersion` / batch              |
| `reportingTimezone` | `SyncDevice.reportingTimezone`               |
| `clientRevision`    | fact + device last revision                  |
| `fact.identityKey`  | `identityKey`                                |
| `fact.totalTokens`  | `totalTokens`                                |
| `fact.cost.status`  | `costStatus`                                 |
| `fact.models[]`     | `DailyModelUsageFact` rows                   |
| `Idempotency-Key`   | not a fact column; platform + optional batch |

## Migration plan

1. Add enums + four models to `prisma/schema.prisma`.
2. Add reverse relations on `User` (`syncDevices`, `dailyUsageFacts`, `syncBatches`).
3. `npm run prisma:migrate -- --name usage_sync_collect` (or equivalent).
4. `npm run prisma:generate` + `npm run verify:prisma`.
5. No data backfill (greenfield feature).

Migration must be forward-only; no destructive changes to auth tables.

## Testing (Phase B)

| Test                                     | Intent                             |
| ---------------------------------------- | ---------------------------------- |
| Migrate on empty DB                      | schema applies                     |
| Unique `(userId, deviceId, identityKey)` | second insert conflicts            |
| Cascade device → facts                   | delete device removes facts        |
| Model identity unique per parent         | sentinel unknown bucket single row |
| Optional repo test                       | upsert then replace children       |

Skip full e2e auth+HTTP until Phase C/E.

## Risks and open decisions for review

Please confirm or override:

| #   | Topic                          | Proposal                                      | Your call                       |
| --- | ------------------------------ | --------------------------------------------- | ------------------------------- |
| 1   | Phase B depth                  | Schema + thin repos                           | Schema-only?                    |
| 2   | Table naming                   | Match existing Prisma style (no snake `@map`) | OK?                             |
| 3   | Model null uniqueness          | `modelIdentityKey` sentinel                   | Partial unique SQL instead?     |
| 4   | Token types                    | `BigInt`                                      | `Int` if you prefer simpler TS? |
| 5   | Cost kind on models            | Optional `UsageCostKind?`                     | Always required like parent?    |
| 6   | `SyncBatch` in B               | Include table now                             | Defer table to Phase D?         |
| 7   | Batch unique client id         | No unique in v1                               | Unique (user, device, batchId)? |
| 8   | `lastClientRevision` on device | Yes                                           | Derive only from facts?         |
| 9   | `UsageDataQuality` enum        | `complete` \| `partial` only                  | Free string instead?            |
| 10  | Platform enum                  | strict 3 values                               | Free string for forward compat? |

**Defaults if no feedback:** 1 schema+thin repos, 2 no map, 3 sentinel, 4 BigInt,
5 optional kind on models, 6 include SyncBatch, 7 no unique batch id, 8 yes on
device, 9 enum complete/partial, 10 strict platform enum.

## Success criteria (when implementing)

- [x] Migration applies cleanly
- [x] Uniques match ADR 0021 upsert identity
- [x] No forbidden privacy columns
- [x] `userId` present for account wipe path
- [x] Typecheck / prisma verify pass
- [x] Exec plan recorded under `docs/exec-plans/`

## Implementation checklist (after approval)

1. Write exec plan `docs/exec-plans/active/YYYY-MM-DD_usage-sync-01-schema.md`
2. Edit `prisma/schema.prisma`
3. Generate migration
4. Scaffold `libs/features/usage-sync/{app/ports,infra/persistence}` as agreed
5. Tests for constraints / repo
6. Update parent plan Phase B exit criteria
7. Commit on `development`

## Explicit non-decisions (Phase C+)

- Exact HTTP status mapping for each `SyncErrorCode`
- Whether lower `clientRevision` soft-ignores or returns `SYNC_REVISION_STALE`
- Batch size constants and rate limits
- OpenAPI component schemas
- Read models / materialized aggregates for calendar

## Summary for reviewers

Phase B adds **four tables** (device, daily fact, model fact, batch audit) with
uniques that make desktop collect upserts safe and multi-device streams
isolated. Soft remove uses `recordState`. Privacy-sensitive local data never
gets columns. Repositories optional-but-recommended so Phase C is API-only work
on a proven schema.

**Please reply with:** approve as-is, or a list of overrides on the open
decisions table (#1–#10). No implementation until that review.

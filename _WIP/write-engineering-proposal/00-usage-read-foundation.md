# Engineering Proposal: Phase 2 PR-0 — Usage read foundation

## Status

Draft — Phase 2 prerequisite (shared infrastructure, **no product HTTP surface required**).  
**Date:** 2026-07-16  
**Parent:** `docs/planning/cloud-sync-backend-handoff.md` (Phase 2)  
**Sibling proposals:** `01`–`05` (endpoints that consume this foundation)  
**Depends on:** Phase 1 collect write path (shipped)  
**Does not authorize implementation** until accepted.

## Summary / recommendation

Before implementing any of `GET /v1/usage/*` or `GET /v1/sync/status`, land a **shared read foundation** inside the existing `libs/features/usage-sync/` slice:

1. A **read-only** repository port + Prisma adapter for querying `DailyUsageFact` / `DailyModelUsageFact`.
2. Small extensions to **device** repository (list by user).
3. Shared **query validation** and **pure domain helpers** (date range, dense series, model attribution, optional device resolve).
4. Module wiring and conventions (OpenAPI tag `Usage`, Clock hygiene, error reuse) so endpoint PRs stay thin.

**Do not** ship five copy-pasted Prisma queries. **Do not** require a new Prisma migration for v1 (indexes already exist). **Do not** change collect write semantics.

Optional in the same PR: ship `GET /v1/sync/status` (proposal `05`) if the foundation lands small — that endpoint only needs device list, not fact queries. **Default recommendation:** foundation-only in PR-0; status can be PR-0b or the first endpoint PR.

## Context and problem

### Current behavior

Phase 1 write path is complete:

| Piece               | Location                                            | Role                                                 |
| ------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Device upsert / get | `SyncDevicesController`, `SyncDevicesRepository`    | Register install; find by `(userId, clientDeviceId)` |
| Daily push          | `DailyUsageController`, `DailyUsageFactsRepository` | Upsert parents + replace models; mark `lastSyncAt`   |
| Domain date parse   | `domain/calendar-date.ts`                           | `isUsageDateString`, `usageDateToUtcDate`            |
| Model identity      | `app/model-identity.ts`                             | `UNKNOWN_MODEL_IDENTITY_KEY = '__unknown__'`         |
| Errors              | `SyncErrorCode.SYNC_DEVICE_NOT_FOUND`               | Already mapped for collect                           |
| Wipe                | `wipe-usage-sync-for-user.ts`                       | Account deletion cleans facts/devices                |

What is **missing**:

- `DailyUsageFactsRepository` is **write-only** (`upsertFactWithModels`, `commitDailyUsagePush`). No sum/group/list.
- `SyncDevicesRepository` has **no** `listByUser` (needed for sync status and convenience `lastSyncAt`).
- No shared filter semantics for “active facts in tz for user, optional device”.
- No pure helpers for dense calendar series or parent-vs-model attribution.
- No OpenAPI `Usage` tag or `/v1/usage` controller home yet.

Without PR-0, each of `01`–`04` would re-implement filters, device resolve, and bigint mapping — high drift risk against ADR 0021 invariants.

### Desired outcome

Endpoint PRs only add: controller + DTO + one app service + tests/OpenAPI for that route. Query rules and SQL live once.

## Goals

- One **read repository** surface covering all five Phase 2 query shapes (even if some methods ship stubbed-then-filled, prefer full method set so later PRs don’t redesign the port).
- **User isolation** enforced in every query (`userId` required).
- **Parent totals authority** and **active-only** defaults encoded in repository contracts (not left to each controller).
- Reuse existing **device identity** model: public `clientDeviceId`, internal UUID only inside repos/services.
- Unit-testable pure helpers; repository tests or thin integration coverage for SQL group-by correctness.
- No collect regression; no schema migration unless evidence proves an index gap (not expected for v1).

## Non-goals

| Out of scope                                         | Why                                             |
| ---------------------------------------------------- | ----------------------------------------------- |
| Shipping all five HTTP endpoints                     | Separate proposals `01`–`05`                    |
| Changing push validation, scopes, or revision policy | Phase 1 locked                                  |
| New tables / columns                                 | Projection already queryable                    |
| Caching layer (Redis)                                | Premature; Postgres + existing indexes first    |
| Admin or cross-user reads                            | Product is user-scoped only                     |
| Timezone re-bucketing                                | v1 filters by stored `aggregationTimezone` only |
| Pagination framework for usage                       | Calendar max 366; day detail is single day      |
| Rate limits for reads                                | Optional later; not foundation-critical         |

## Constraints and invariants

From ADR 0020 / 0021 and Phase 2 endpoint proposals:

1. **Parent authority** — period/day totals come from `DailyUsageFact.totalTokens`, never from summing model children.
2. **Multi-device sum** — user-level queries omit device filter and sum across devices; filter uses resolved internal `deviceId`.
3. **Active default** — v1 reads use `recordState = 'active'` only (`removed` / `missing` excluded from UI totals).
4. **Timezone filter** — `aggregationTimezone = query.timezone` (exact string match as stored).
5. **Layering** — `app` ports do not import Prisma; Prisma lives under `infra/persistence`.
6. **Clock** — wall “now” only via injected `Clock` in app services that need it (summary). Pure date math stays in `domain/`.
7. **Errors** — reuse `SyncErrorCode.SYNC_DEVICE_NOT_FOUND` for unowned/missing `clientDeviceId` filter; validation → `VALIDATION_FAILED`.
8. **Privacy** — read path only exposes already-stored aggregate fields; never invent paths/sessions.

## Proposed design

### Ownership diagram

```text
                    ┌─────────────────────────────────────┐
                    │  Future: Usage*Controller (01–04)   │
                    │  Future: SyncStatusController (05)  │
                    └───────────────┬─────────────────────┘
                                    │ app services
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
  ResolveDeviceFilter      UsageReadRepository        SyncDevicesRepository
  (app helper/service)     (NEW read port)            (+ listByUser)
          │                         │                         │
          └────────────┬────────────┴────────────┬────────────┘
                       ▼                         ▼
            PrismaUsageReadRepository   PrismaSyncDevicesRepository
                       │                         │
                       └──────────┬──────────────┘
                                  ▼
                         Postgres (existing tables)
```

### 1) Device repository extension

Extend `SyncDevicesRepository` (keep write methods):

```ts
listByUser(userId: string): Promise<readonly SyncDeviceRecord[]>;
// Order: lastSyncAt DESC NULLS LAST, createdAt DESC
```

Prisma: `findMany({ where: { userId }, orderBy: [...] })` using existing index `(userId, lastSyncAt)`.

**Device filter resolve** (app-layer helper, not a separate Nest service unless reused widely):

```ts
async function resolveOptionalClientDeviceId(input: {
  userId: string;
  clientDeviceId: string | undefined;
  devices: SyncDevicesRepository;
}): Promise<string | undefined>; // internal SyncDevice.id
```

- `undefined` / empty filter → no device constraint.
- Present but not found for user → throw app error mapped to `SYNC_DEVICE_NOT_FOUND` (same as collect).

Do **not** accept server UUIDs as the public `deviceId` query param; public API stays `clientDeviceId` (named `deviceId` in query strings per endpoint proposals).

### 2) Usage read repository port

New file: `libs/features/usage-sync/app/ports/usage-read.repository.ts`

**Shared filter type** (conceptual):

```ts
type UsageReadScope = Readonly<{
  userId: string;
  aggregationTimezone: string;
  /** Internal SyncDevice.id when filter applied */
  deviceId?: string;
  /** Default true in all v1 methods */
  activeOnly?: boolean; // always true for v1 call sites
}>;
```

**Required methods** (names illustrative; keep types strict, no `any`):

| Method                                                           | Used by                     | Behavior                                               |
| ---------------------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| `sumParentTotals(scope, fromDate, toDate, sourceKey?)`           | summary, models, day totals | `SUM(totalTokens)`, `COUNT(*)`, optional category sums |
| `groupParentTotalsByDate(scope, fromDate, toDate)`               | calendar                    | rows `{ usageDate, totalTokens, factCount }` sparse    |
| `listActiveParentsForDay(scope, usageDate)`                      | day detail                  | parents + joined device public fields                  |
| `listModelsForFactIds(userId, factIds)`                          | day detail                  | children for parents; empty if no ids                  |
| `aggregateModelsByIdentity(scope, fromDate, toDate, sourceKey?)` | models                      | group by `modelIdentityKey` with token sums            |
| `maxDeviceLastSyncAt(userId, deviceId?)`                         | summary convenience         | `MAX(lastSyncAt)` on devices                           |

Notes:

- Date params are calendar dates as `Date` at UTC midnight (same as write path via `usageDateToUtcDate`) or as validated `YYYY-MM-DD` strings converted at the repo boundary — **pick one convention and use it everywhere** (recommend: repo accepts `Date` UTC-midnight; app converts after validation).
- Category sums: `SUM` of non-null columns only (SQL `SUM` ignores nulls); expose separately so services can return `null` when count of non-null is 0.
- **Do not** put dense calendar fill in the repository — return sparse rows; domain helper densifies.
- **Do not** compute unattributed remainder in SQL — pure helper after parent + model sums.

Implementation: `infra/persistence/prisma-usage-read.repository.ts` implementing the port. Prefer `groupBy` / raw SQL only where Prisma groupBy is awkward; keep queries indexed:

- `(userId, aggregationTimezone, usageDate)`
- `(userId, recordState, usageDate)`
- `(deviceId, usageDate)` when filtered

### 3) Pure domain / app helpers

| Helper                                | Location                               | Responsibility                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Date range validation                 | `domain/` or `app/usage-read-query.ts` | `from`/`to` valid, `to >= from`, max **366** inclusive days                                                                                                                                                        |
| Dense date series                     | `domain/dense-date-series.ts`          | Walk `from`→`to`, fill zeros for missing dates                                                                                                                                                                     |
| Model attribution                     | `app/model-attribution.ts`             | `unattributed = max(0, parentTotal - modelsSum)`                                                                                                                                                                   |
| IANA timezone check                   | shared validation helper               | Reject empty/invalid; collect today only documents IANA — **recommend** `Intl.DateTimeFormat` / try-catch on `timeZone` option for v1 (same class of check as many Nest apps); document limitation if exotic zones |
| Cost aggregate helper (optional PR-0) | `app/cost-aggregate.ts`                | Same-currency sum + `mixed` / `partial` — can land with summary if preferred                                                                                                                                       |

Reuse: `isUsageDateString`, `usageDateToUtcDate`, `UNKNOWN_MODEL_IDENTITY_KEY` / `toModelIdentityKey`.

### 4) Shared query DTO building blocks (infra)

Not full endpoint DTOs, but reusable pieces under e.g. `infra/http/dtos/usage-read-query.dto.ts`:

- `timezone: string` (required on usage reads)
- `deviceId?: string` (client device id; max length align with schema `VarChar(128)`)
- `from` / `to` date strings for range endpoints

Endpoint PRs compose these into route-specific DTOs. PR-0 can introduce the shared fields + validation pipes/class-validator decorators without registering controllers.

### 5) Module wiring

In `usage-sync.module.ts`:

- Provide `PrismaUsageReadRepository` as `UsageReadRepository` (token or class pattern matching existing repos).
- Export read repository if other modules need it (unlikely in v1; export optional).
- Extend devices repo provider (same class, new method).
- **No new controllers required** for foundation-only PR-0.

DI style: follow existing `provideConstructedAppService` / constructor injection used by `SyncDevicesService` and `PushDailyUsageService`.

### 6) OpenAPI / tags convention (document in PR-0, apply when first controller lands)

| Path prefix       | Tag     | Notes                                   |
| ----------------- | ------- | --------------------------------------- |
| `/v1/usage/*`     | `Usage` | New tag; first endpoint PR registers it |
| `/v1/sync/status` | `Sync`  | Existing tag family with devices/push   |

PR-0 itself may not touch `openapi.yaml` if no routes ship. If status ships with PR-0, regenerate OpenAPI in that same PR.

### 7) Serialization convention (bigint)

Prisma stores tokens as `BigInt`. Collect HTTP DTOs already accept/return JSON numbers for token fields in e2e fixtures. **Recommendation for reads:**

- App/view types use `bigint` internally.
- HTTP DTOs map to **number** when `Number.isSafeInteger`; if out of range, use **string** (or fail closed with logging) — document the chosen policy in the first endpoint PR and reuse a single mapper `bigintToJsonNumber(value: bigint): number`.

Foundation PR should add that mapper once (`app/json-bigint.ts` or similar) so endpoints do not diverge.

### 8) Test strategy for PR-0

| Layer              | What                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | Dense date series; model attribution; range validation (366, inverted range); optional device resolve mock                                         |
| Integration / repo | Optional: seed facts via Prisma in existing int harness, assert group-by sums and removed exclusion                                                |
| e2e                | **Not required** for foundation-only; first endpoint PR adds e2e using existing push fixtures (`test/usage-sync-daily-usage.e2e-spec.ts` patterns) |

Optional shared test helper (can land with first e2e):

```ts
// test/support/usage-sync-seed.ts (conceptual)
registerDevice + pushDailyUsage fixtures → known totals for calendar/day asserts
```

### 9) What “done” looks like for sequencing

```text
PR-0  foundation (this proposal)
  → PR-1  GET /v1/sync/status          (05)  — devices only
  → PR-2  GET /v1/usage/calendar       (02)
  → PR-3  GET /v1/usage/days/{date}    (03)  — attribution helper
  → PR-4  GET /v1/usage/summary        (01)  — Clock windows
  → PR-5  GET /v1/usage/models         (04)
```

MVP exit (handoff): through PR-3.

## Alternatives considered

| Option                                               | Verdict                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extend `DailyUsageFactsRepository` with read methods | Acceptable alternative; **prefer separate `UsageReadRepository`** so write transactional API stays focused and read can evolve without commit coupling |
| New feature package `libs/features/usage-read`       | Rejected — same domain tables, violates “extend usage-sync” and duplicates module/auth wiring                                                          |
| Ship foundation inside first endpoint PR only        | Works for calendar-only, but day/models/summary then fork helpers; explicit PR-0 reduces thrash                                                        |
| Include all five endpoints in one PR                 | Rejected — review and regression risk too high                                                                                                         |
| Materialized rollup tables                           | Deferred until query evidence shows need                                                                                                               |

## Material risks and tradeoffs

| Risk                                        | Mitigation                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Port designed wrong, rewritten per endpoint | Define methods from all five proposals up front (table above)             |
| Timezone validation false negatives         | Document IANA check approach; align with collect if collect later hardens |
| Over-building before first HTTP proof       | Keep PR-0 without controllers; prove with unit/repo tests                 |
| BigInt JSON footguns                        | Single mapper; e2e asserts numeric tokens match push fixtures             |
| Accidental write methods on read repo       | Interface has queries only; no upsert                                     |

## Acceptance criteria

- [ ] `UsageReadRepository` port + Prisma implementation exist and are registered in `UsageSyncModule`.
- [ ] `SyncDevicesRepository.listByUser` returns devices ordered as specified.
- [ ] Optional client device filter resolve throws `SYNC_DEVICE_NOT_FOUND` when not owned.
- [ ] Shared range validation enforces inclusive max 366 days and valid `YYYY-MM-DD`.
- [ ] Dense date series + model attribution pure helpers unit-tested.
- [ ] Read queries default to `recordState = active` and require `userId`.
- [ ] No Prisma schema migration unless a real gap is proven.
- [ ] Collect e2e still green; no behavior change to push/devices write APIs.
- [ ] Typecheck / lint / feature boundaries (`deps:check`) pass for new imports (infra → app → domain only).

## Open questions

| Topic                                                | Recommended default                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Ship `GET /v1/sync/status` in same PR as foundation? | **No** — foundation-only; status as immediate follow-up (tiny)                              |
| Read methods on write repo vs new port?              | **New** `UsageReadRepository`                                                               |
| Cost aggregate helper in PR-0?                       | **Defer** to summary PR unless cheap                                                        |
| Repo-level integration tests in PR-0?                | **Yes** for group-by + removed exclusion if harness is easy; else unit + first calendar e2e |
| IANA validation library?                             | Prefer zero new deps: `Intl` try/`timeZone`                                                 |

## Effort

**Small–medium** (1 focused PR): ports, Prisma queries, helpers, unit tests, module wiring. No OpenAPI churn if no routes.

## Related documents

| Doc                                           | Role                                |
| --------------------------------------------- | ----------------------------------- |
| `README.md` (this folder)                     | Phase 2 index + product rules       |
| `01-usage-summary.md` … `05-sync-status.md`   | Consumers of this foundation        |
| ADR `0020`, `0021`                            | Projection + identity/device policy |
| `docs/planning/cloud-sync-backend-handoff.md` | Phase 2 deliverables                |
| `docs/guide/adding-an-endpoint.md`            | Applied in endpoint PRs, not PR-0   |

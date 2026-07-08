# Usage Sync Phase C.2 — Daily Usage Push API

Date: 2026-07-09  
Owner: burnly-api  
Status: active  
Risk class: high  
Related issue/PR: N/A

## Objective

Implement `POST /v1/sync/daily-usage` so a signed-in desktop can push a batch of
daily usage facts (+ model breakdowns) with validation, all-or-nothing commits,
and stable problem codes—using Phase B repositories and Phase C.1 device APIs.

Contract source: `docs/planning/desktop-collect-api-requirements.md`  
Parent plan: `docs/planning/desktop-collect-implementation-plan.md` (Phase C)  
Depends on:

- ADR 0020 / 0021
- Phase B persistence + repos
- **Exec plan 02 complete** (device PUT so clients can register before push; push
  may still auto-resolve device by `clientDeviceId` and return
  `SYNC_DEVICE_NOT_FOUND` if missing—do **not** auto-create device on push)

## Constraints

- Architecture constraints:
  - Validation pure where possible (`app/` or `domain/`); no Nest in domain
  - Single transaction for the batch write path (or sequential upserts in one
    transaction)—**no partial commit** on validation failure
  - Reconstruct identity key; reject mismatches with `SYNC_IDENTITY_INVALID` or
    field-level `VALIDATION_FAILED` (prefer feature code when branching is useful)
  - Use `Clock` for `syncedAt` server time (no ad-hoc `new Date()` in app services)
  - Feature errors typed with `SyncErrorCode | ErrorCode`
- Product/runtime constraints:
  - Rolling window only (`scope: "rolling"`); never delete out-of-window history
  - Soft remove via `recordState = removed`
  - Stale revision: ignore older writes (repo already returns `ignored_stale`)
  - Forbidden privacy fields must not be accepted as first-class DTO fields
- Out of scope:
  - Making `Idempotency-Key` mandatory + replay product polish (Phase D)—may still
    attach `@Idempotent` optionally if trivial with platform defaults
  - Hard batch size / body limits enforcement beyond DTO max array size (Phase D
    for published limits + `SYNC_PAYLOAD_TOO_LARGE`)
  - Account deletion wipe (Phase D)
  - Web `GET /v1/usage/*` reads
  - Full resync tombstone sweeps (`scope: "full"`)

## Impact Areas

- API/OpenAPI: **yes**
- DB/Prisma/migrations: no (expected)
- Auth/session: yes (guard)
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: yes (no tokens in logs; optional batch audit row)
- External integrations: no
- CI/release/harness: yes (OpenAPI + e2e)

## Endpoint

### `POST /v1/sync/daily-usage`

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
Idempotency-Key: <uuid>   # recommended; required policy deferred to Phase D
```

**Top-level body** (see requirements for full field table):

| Field | Required |
| --- | --- |
| `contractVersion` | yes (v1: `1` only) |
| `clientDeviceId` | yes |
| `appVersion` | yes |
| `reportingTimezone` | yes |
| `clientRevision` | yes (integer ≥ 1 or ≥ 0—document; suggest ≥ 1) |
| `window.startDate` / `endDate` / `scope` | yes; scope must be `rolling` |
| `facts` | yes (array; may be empty) |

**Per fact:** identity fields, tokens, cost object, `dataQuality`, `recordState`,
timestamps, `models[]`.

**Server steps:**

1. Authenticate.
2. Load device by `(userId, clientDeviceId)` → else `SYNC_DEVICE_NOT_FOUND`.
3. If `contractVersion` unsupported → `SYNC_CONTRACT_UNSUPPORTED`.
4. Validate entire payload (all-or-nothing). Including:
   - date shapes `YYYY-MM-DD`
   - non-negative tokens; `totalTokens` required
   - cost status/amount/currency pairing
   - `identityKey === \`${sourceKey}:daily:v${identityVersion}:${aggregationTimezone}:${usageDate}\``
   - model cost rules (desktop: estimated | unavailable typical)
5. For each fact: `upsertFactWithModels` (revision policy in repo).
6. Optionally update device `lastSyncAt` / `lastClientRevision` + `reportingTimezone` /
   `appVersion` from batch metadata.
7. Optionally write `SyncBatch` audit row (`accepted`).
8. Return:

```json
{
  "data": {
    "clientDeviceId": "…",
    "acceptedAt": "…",
    "clientRevision": 42,
    "window": { "startDate": "…", "endDate": "…", "scope": "rolling" },
    "counts": {
      "received": 12,
      "upserted": 11,
      "removed": 1,
      "unchanged": 0,
      "rejected": 0
    }
  }
}
```

Count mapping proposal:

| Count | Meaning |
| --- | --- |
| `received` | `facts.length` |
| `upserted` | outcomes `created` + `updated` with `recordState != removed` (or all non-stale writes—document) |
| `removed` | successful writes with `recordState = removed` |
| `unchanged` | `ignored_stale` (and optionally no-op equal writes if detected) |
| `rejected` | always `0` when all-or-nothing success; failures are HTTP errors |

## Validation rules (implement checklist)

- [ ] `contractVersion === 1`
- [ ] Window: `startDate <= endDate`, scope `rolling`
- [ ] Identity reconstruction for every fact
- [ ] Cost pairing (`available`/`estimated` require amount+currency; others null)
- [ ] Token null vs zero semantics preserved into repo (`null` not coerced to `0`)
- [ ] `recordState = removed` requires `removedAt` when requirements demand it
- [ ] Reject unknown body properties on DTOs
- [ ] Reasonable max array length on DTO (e.g. 1000 facts) as soft guard even if
      Phase D publishes formal limits

## Implementation Checklist

### Domain / app

- [ ] Pure helpers: `buildDailyIdentityKey(...)`, cost validators, token checks
- [ ] Unit tests for identity rebuild + cost pairing + window rules
- [ ] `PushDailyUsageService` (name flexible) orchestrating device lookup + validate + upsert loop
- [ ] Inject `Clock` for `syncedAt` / `acceptedAt`
- [ ] Map repo outcomes → response counts
- [ ] `SyncBatch` create on success (and optionally on validation failure only if we
      want reject audit—default: success path only in this plan)

### HTTP

- [ ] Controller `POST /v1/sync/daily-usage`
- [ ] Nested DTOs matching requirements field names (requirements win)
- [ ] Guards + bearer + error codes:
  - `UNAUTHORIZED`
  - `VALIDATION_FAILED`
  - `SYNC_CONTRACT_UNSUPPORTED`
  - `SYNC_DEVICE_NOT_FOUND`
  - `SYNC_IDENTITY_INVALID` (if used)
  - `INTERNAL`
  - optionally `IDEMPOTENCY_IN_PROGRESS` if `@Idempotent` applied
- [ ] Optional `@Idempotent({ scopeKey: 'sync.daily-usage.push' })` with optional header
- [ ] Do **not** auto-create devices on push

### OpenAPI and tests

- [ ] OpenAPI generate + check; document request/response + error codes
- [ ] Unit tests for validators
- [ ] E2E happy path: login → PUT device (02) → POST fixture from requirements
- [ ] E2E: invalid identityKey → 400, no row written
- [ ] E2E: missing device → 404 `SYNC_DEVICE_NOT_FOUND`
- [ ] E2E: no auth → 401
- [ ] E2E: replay same payload with higher revision updates totals
- [ ] E2E: lower revision does not overwrite (unchanged/stale behavior)

## Acceptance Criteria

1. Canonical fixture from requirements is accepted for a registered device.
2. Response counts are consistent with DB state after push.
3. Invalid identity or cost fails the whole batch with 400; no partial facts.
4. Unknown device fails with `SYNC_DEVICE_NOT_FOUND`; no fact writes.
5. Unauthenticated → 401.
6. Device `lastSyncAt` updated after successful non-empty or empty accepted push
   (confirm: empty facts still counts as successful heartbeat—**yes**, update
   lastSyncAt).
7. OpenAPI includes the operation; `deps:check` / typecheck / tests pass.

## Decision Log

- 2026-07-09: Push does not create devices; client must PUT first (clearer ownership).
- 2026-07-09: All-or-nothing validation for v1.
- 2026-07-09: Soft ignore stale revisions (no `SYNC_REVISION_STALE` required).
- Empty `facts[]` allowed as heartbeat after device registration.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run deps:check
npm run openapi:generate
npm run openapi:check
# with Postgres (+ Redis if idempotency enabled):
npm run test:e2e -- --testPathPatterns=usage-sync
```

## Runtime Evidence

- Environment: local API, migrated DB
- Flow: auth → device PUT → daily-usage POST (canonical fixture)
- Confirm DB: one `DailyUsageFact` + models; `SyncDevice.lastSyncAt` set

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Large DTO / validation complexity | Pure unit-tested validators; thin controller |
| Count semantics ambiguous | Document mapping in response DTO comments + this plan |
| JS number vs BigInt for tokens | Accept JSON numbers in DTO; convert to `bigint` in service with safe integer checks |
| Partial writes on mid-loop failure | Single transaction wrapping all fact upserts |
| OpenAPI snapshot churn | One generate at end of PR |

## Completion Notes

_(fill when done)_

## Follow-Ups

- [ ] Phase D: mandatory Idempotency-Key policy, `SYNC_PAYLOAD_TOO_LARGE`, rate limits
- [ ] Phase D: account deletion wipe of sync tables (if soft-delete user path)
- [ ] Phase E: broader contract gates / harness if not fully covered here
- [ ] Desktop client integration against published OpenAPI

# Engineering Proposal: `GET /v1/usage/summary`

## Status

Draft — Phase 2 web read path.  
**Date:** 2026-07-16  
**Parent:** `docs/planning/cloud-sync-backend-handoff.md` (Phase 2 / Read APIs)  
**Depends on:** Phase 1 collect write path (shipped); shared usage-read helpers  
**Does not authorize implementation** until product/eng accept this draft.

## Summary / recommendation

Add an authenticated **user-level period summary** endpoint that answers the same product questions as the desktop tray for a signed-in multi-day cloud history window: **today / week / month** token totals (and optional category + cost aggregates), summing **active parent** facts across devices by default.

Prefer fixed relative periods (not arbitrary ranges). Arbitrary ranges belong on calendar + models.

## Context and problem

### Current behavior

- Desktop tray aggregates local SQLite with:

  ```sql
  SUM(daily_usage.total_tokens)
  WHERE usage_date BETWEEN ? AND ?
    AND aggregation_timezone = ?
    AND record_state <> 'removed'
  ```

- Cloud already stores the projection (`DailyUsageFact`) via `POST /v1/sync/daily-usage`.
- **No** cloud read API exists; web cannot show tray-equivalent totals for the account.

### Desired outcome

Web (and any authenticated client) can load one summary payload to paint “today / this week / this month” chrome without N calendar/model calls.

## Goals

- Match tray **authority rules**: parent `totalTokens` only; exclude `removed`.
- Multi-device default **sum** (ADR 0021); optional single-device filter via `clientDeviceId`.
- Timezone-correct period boundaries using query `timezone` + injected `Clock`.
- Stable OpenAPI contract under tag `Usage`.

## Non-goals

| Out of scope                           | Why                                             |
| -------------------------------------- | ----------------------------------------------- |
| Model breakdown                        | `GET /v1/usage/models`, day detail              |
| Calendar heatmap cells                 | `GET /v1/usage/calendar`                        |
| Arbitrary custom ranges                | Calendar + models                               |
| Re-bucketing facts into a different tz | v1 filters by stored `aggregationTimezone` only |
| Write / collect changes                | Phase 1                                         |

## Constraints and invariants

1. **Parent totals authority** — never derive period totals from `DailyModelUsageFact`.
2. **User isolation** — every query is `userId = principal.userId`; no admin cross-user.
3. **Clock hygiene** — “now” comes from `Clock` (`libs/shared/time.ts`); no ad-hoc `Date.now()` in app services (ADR 0017).
4. **Envelope / errors** — success `{ data }`; RFC7807 with `code` + `traceId`.
5. **Indexes already present** — `(userId, aggregationTimezone, usageDate)`, `(userId, recordState, usageDate)`.

## Proposed design

### Contract

```http
GET /v1/usage/summary?timezone=Asia/Jakarta&deviceId={optionalClientDeviceId}
Authorization: Bearer <accessToken>
```

| Query      | Required | Notes                                                                                              |
| ---------- | -------- | -------------------------------------------------------------------------------------------------- |
| `timezone` | yes      | IANA; defines calendar “today”, week window, and month; also filters `aggregationTimezone`         |
| `deviceId` | no       | Desktop `clientDeviceId` (not server UUID). Missing device owned by user → `SYNC_DEVICE_NOT_FOUND` |

`operationId`: `usage.summary.get`  
Tag: **`Usage`**

### Response shape (`200`)

```json
{
  "data": {
    "timezone": "Asia/Jakarta",
    "asOf": "2026-07-15T04:00:00.000Z",
    "periods": {
      "today": {
        "startDate": "2026-07-15",
        "endDate": "2026-07-15",
        "totalTokens": 12345,
        "inputTokens": 8000,
        "outputTokens": 4000,
        "cacheCreationTokens": null,
        "cacheReadTokens": 345,
        "cost": {
          "status": "partial",
          "amountMicros": 123456,
          "currency": "USD",
          "factsWithCost": 3,
          "factsTotal": 5
        }
      },
      "week": { "...same shape..." },
      "month": { "...same shape..." }
    },
    "deviceFilter": null,
    "lastSyncAt": "2026-07-15T03:55:00.000Z"
  }
}
```

Empty account / no facts: zeros for token fields, `cost.status = "unavailable"`, `lastSyncAt: null`.

### Error codes

| Code                    | When                                                      |
| ----------------------- | --------------------------------------------------------- |
| `VALIDATION_FAILED`     | Missing/invalid timezone; malformed `deviceId`            |
| `UNAUTHORIZED`          | Missing/invalid access token                              |
| `SYNC_DEVICE_NOT_FOUND` | `deviceId` set but not owned by user (existing sync code) |
| `INTERNAL`              | Unexpected                                                |

### Period window rules (recommended decisions)

| Period    | Definition                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| **today** | Calendar date of `Clock.now()` in `timezone`                                                                           |
| **week**  | **Last 7 calendar days including today** (tray-friendly rolling window) — not ISO week, unless product later locks ISO |
| **month** | Calendar month of “now” in `timezone` (`YYYY-MM-01` … last day of month)                                               |

Document `startDate` / `endDate` on every period so clients do not re-guess.

### Aggregation rules

1. Base filter: `userId`, `recordState = active`, `aggregationTimezone = query.timezone`, optional device.
2. `totalTokens` = `SUM(totalTokens)` over matching facts in each period’s date range.
3. Category fields (`inputTokens`, …): **sum of non-null values only**; if no non-null values for a category, return `null`.
4. Cost:
   - Include only facts with `costStatus` in (`available`, `estimated`) and non-null amount+currency.
   - If all cost-bearing facts share one currency → sum `costAmountMicros`, set `status` to `available` / `estimated` / `partial` based on whether every fact in the period had cost.
   - Mixed currencies → `status: "mixed"`, omit single amount.
5. `lastSyncAt`: `MAX(SyncDevice.lastSyncAt)` for the user (or filtered device). Convenience only; Settings should prefer `GET /v1/sync/status`.
6. Serialize bigint token fields as **JSON numbers** only when safe for JS (`Number.isSafeInteger`); otherwise as **strings**. **Recommendation:** match collect/response conventions already used in usage-sync DTOs (inspect existing push response serialization and stay consistent).

### Ownership and placement

```text
libs/features/usage-sync/
  domain/                 # pure window helpers if needed (extend calendar-date)
  app/
    get-usage-summary.service.ts
    ports/usage-read.repository.ts   # shared with other read endpoints
  infra/
    http/usage-summary.controller.ts
    http/dtos/usage-summary.dto.ts
    persistence/prisma-usage-read.repository.ts
```

- Controller: `@UseGuards(AccessTokenGuard)`, `@ApiBearerAuth('access-token')`, `@ApiErrorCodes([...])`.
- Service: inject `Clock` + read repository; no Prisma.
- Module: register providers in existing `usage-sync.module.ts`.

### Runtime flow

```text
Client
  -> UsageSummaryController
  -> GetUsageSummaryService
       1. validate timezone + optional deviceId
       2. resolve device UUID if filtered
       3. compute today/week/month date ranges from Clock + timezone
       4. repository.sumTokensByDateRange (x3 or one multi-range query)
       5. repository.maxLastSyncAt
  -> { data }
```

Reads are safe to retry; no idempotency key.

## Alternatives considered

| Option                                       | Verdict                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Client builds summary from calendar API only | Rejected for chrome UX (3 periods × many days); server summary is one round-trip      |
| ISO week instead of rolling 7 days           | Open product choice; default rolling 7 for tray parity                                |
| Sum across all aggregation timezones         | Rejected — mixed-tz totals are misleading; require consistent reporting tz on desktop |

## Material risks and tradeoffs

| Risk                                                      | Mitigation                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Client timezone ≠ fact aggregationTimezone → empty totals | Document; desktop should push with user’s reporting tz                   |
| Week definition mismatch desktop vs web                   | Lock rolling-7 in OpenAPI description; change only with product sign-off |
| Cost mixed / partial confusion                            | Explicit `cost.status` enum values in DTO                                |
| BigInt JSON                                               | Follow existing usage-sync DTO number/string policy                      |

## Acceptance criteria

- [ ] Authenticated user receives period totals that equal `SUM(active parent totalTokens)` for the documented windows and timezone.
- [ ] Multi-device: two devices same day → summed in user-level summary; `deviceId` filter isolates one install.
- [ ] `recordState = removed` facts excluded.
- [ ] Facts with other `aggregationTimezone` excluded when query timezone differs.
- [ ] Invalid timezone / unowned `deviceId` return documented problem codes.
- [ ] Unit tests for window bounds + aggregation; e2e: push fixtures → assert summary numbers.
- [ ] OpenAPI snapshot + Spectral pass; `operationId` present.

## Open questions

| Topic                         | Recommended default                                                      |
| ----------------------------- | ------------------------------------------------------------------------ |
| Week = rolling 7 vs ISO week  | Rolling 7 including today                                                |
| Include `missing` recordState | No (active only)                                                         |
| Rate limit summary            | Optional light limit later; not required for v1 (read-only, user-scoped) |

## Effort

**Small–medium** once shared `UsageReadRepository` exists; otherwise medium for foundation + endpoint.

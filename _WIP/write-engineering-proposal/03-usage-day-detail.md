# Engineering Proposal: `GET /v1/usage/days/{date}`

## Status

Draft — Phase 2 web read path.  
**Date:** 2026-07-16  
**Parent:** `docs/planning/cloud-sync-backend-handoff.md` (Phase 2; Day detail mapping)  
**Depends on:** Phase 1 collect; shared usage-read helpers; calendar endpoint optional but complementary  
**Does not authorize implementation** until accepted.

## Summary / recommendation

Add a **single-day drill-down** endpoint: all active parent daily facts for a calendar date (optionally one device), each with **model children**, day-level parent totals, light `bySource` rollup, and explicit **model unattributed remainder** so the UI never treats children as period authority.

Together with calendar, this satisfies Phase 2 exit criteria: _web can render calendar and day drill-down for a fixture account_.

## Context and problem

### Current behavior

- Collect stores parents + model children with scoped replace on push.
- Model identity uses `modelIdentityKey` (`rawModelId` or unknown sentinel) — see `libs/features/usage-sync/app/model-identity.ts`.
- No day read API; web cannot open a calendar cell into source/model detail.

### Desired outcome

Click calendar cell → load parents for that date with models, device labels, and day totals consistent with the cell’s token sum.

## Goals

- Day totals from **parent** `totalTokens` only.
- Per-fact model list + `modelAttribution.unattributedTokens`.
- Device metadata for multi-device clarity (`clientDeviceId`, display name, platform).
- Empty day is `200` with zeros/empty arrays (not `404`).

## Non-goals

| Out of scope                   | Why                                  |
| ------------------------------ | ------------------------------------ |
| Multi-day range                | Calendar + models                    |
| Session explorer               | Not synced (ADR 0020)                |
| Mutating facts from web        | Phase 2 is read-only                 |
| Including `removed` rows in UI | Soft tombstones stay out of defaults |

## Constraints and invariants

1. **Never** set day `totals.totalTokens` from sum of model children.
2. Per fact:

   ```text
   unattributedTokens = max(0, parent.totalTokens - sum(models.totalTokens treating null as 0))
   ```

3. User isolation + optional device filter same as other usage reads.
4. Avoid N+1: load parents then `WHERE dailyUsageFactId IN (...)` for models (or single join with careful mapping).
5. Soft response size cap (e.g. 500 facts/day) — pathological; document reject or truncate with meta if ever hit.

## Proposed design

### Contract

```http
GET /v1/usage/days/2026-07-08?timezone=Asia/Jakarta&deviceId={optional}
Authorization: Bearer <accessToken>
```

| Param         | Required | Notes                               |
| ------------- | -------- | ----------------------------------- |
| `date` (path) | yes      | `YYYY-MM-DD` (`isUsageDateString`)  |
| `timezone`    | yes      | IANA; filters `aggregationTimezone` |
| `deviceId`    | no       | `clientDeviceId`                    |

`operationId`: `usage.days.get`  
Tag: **`Usage`**

### Response (`200`)

```json
{
  "data": {
    "date": "2026-07-08",
    "timezone": "Asia/Jakarta",
    "deviceFilter": null,
    "totals": {
      "totalTokens": 4200,
      "inputTokens": 2500,
      "outputTokens": 1500,
      "cacheCreationTokens": 0,
      "cacheReadTokens": 200,
      "cost": {
        "status": "estimated",
        "amountMicros": 99999,
        "currency": "USD"
      }
    },
    "bySource": [
      {
        "sourceKey": "claude-code",
        "totalTokens": 3000
      }
    ],
    "facts": [
      {
        "identityKey": "claude-code:daily:v1:Asia/Jakarta:2026-07-08",
        "identityVersion": 1,
        "sourceKey": "claude-code",
        "usageDate": "2026-07-08",
        "aggregationTimezone": "Asia/Jakarta",
        "device": {
          "clientDeviceId": "dev_…",
          "displayName": "laptop",
          "platform": "linux"
        },
        "inputTokens": 1200,
        "outputTokens": 800,
        "cacheCreationTokens": 0,
        "cacheReadTokens": 100,
        "totalTokens": 2100,
        "unclassifiedTokens": 0,
        "cost": {
          "status": "estimated",
          "kind": "collector_calculated",
          "amountMicros": 12345,
          "currency": "USD"
        },
        "dataQuality": "complete",
        "recordState": "active",
        "clientLastSeenAt": "2026-07-09T02:00:00.000Z",
        "clientRevision": 42,
        "syncedAt": "2026-07-09T12:00:00.000Z",
        "models": [
          {
            "rawModelId": "claude-sonnet-4",
            "modelIdentityKey": "claude-sonnet-4",
            "displayName": null,
            "providerKey": "anthropic",
            "totalTokens": 2000,
            "inputTokens": 1200,
            "outputTokens": 800,
            "cacheCreationTokens": 0,
            "cacheReadTokens": 0,
            "cost": { "status": "unavailable" }
          }
        ],
        "modelAttribution": {
          "modelsTotalTokens": 2000,
          "parentTotalTokens": 2100,
          "unattributedTokens": 100
        }
      }
    ]
  }
}
```

### Error codes

| Code                    | When              |
| ----------------------- | ----------------- |
| `VALIDATION_FAILED`     | Bad date/timezone |
| `UNAUTHORIZED`          | Auth              |
| `SYNC_DEVICE_NOT_FOUND` | device filter     |
| `INTERNAL`              | Unexpected        |

### Query rules

1. Load parents: `userId`, `usageDate = date`, `aggregationTimezone = timezone`, `recordState = active` (+ optional device).
2. Join/include `SyncDevice` for public device fields (**omit server UUID** `SyncDevice.id` in v1 response).
3. Load models for parent ids in one query.
4. Order facts: `sourceKey` ASC, then `clientDeviceId` ASC.
5. Build `bySource` by summing parent `totalTokens` group by `sourceKey`.
6. Day cost aggregation: same currency rules as summary.

### Ownership and placement

```text
app/get-usage-day.service.ts
app/model-attribution.ts              # pure helper shared with models endpoint
infra/http/usage-day.controller.ts
infra/http/dtos/usage-day.dto.ts
ports/usage-read.repository.ts
  listActiveFactsForDay(...)
  listModelsForFactIds(...)
```

### Runtime flow

```text
Controller -> GetUsageDayService
  validate date + timezone
  resolve optional device
  parents = repo.listActiveFactsForDay
  models  = repo.listModelsForFactIds(parentIds)
  attach models + attribution
  reduce totals + bySource
  return { data }
```

## Alternatives considered

| Option                              | Verdict                                        |
| ----------------------------------- | ---------------------------------------------- |
| 404 when no facts                   | Rejected — empty day is normal for calendar UX |
| Nested only under calendar response | Rejected — separate GET keeps calendar light   |
| Expose internal fact UUID           | Optional later; not required for v1 UI         |

## Material risks

| Risk                             | Mitigation                                            |
| -------------------------------- | ----------------------------------------------------- |
| Clients sum models for day total | Document invariant; expose attribution fields         |
| N+1 Prisma includes              | Explicit two-query or include once                    |
| Cost on models often unavailable | Mirror desktop: model cost only estimated/unavailable |

## Acceptance criteria

- [ ] Day `totals.totalTokens` equals sum of returned parent facts’ `totalTokens`.
- [ ] Calendar cell for same date/tz/device filter matches day totals.
- [ ] Unattributed remainder correct when children incomplete.
- [ ] Removed facts absent; multi-device day returns multiple facts.
- [ ] Empty day → `200`, empty `facts`, zero totals.
- [ ] Unit + e2e from push fixtures; OpenAPI examples include attribution.

## Open questions

| Topic                    | Recommended default                                                 |
| ------------------------ | ------------------------------------------------------------------- |
| Include server `fact.id` | Omit in v1                                                          |
| Soft fact cap            | 500; log + still return if under, else `INTERNAL` or paginate later |

## Effort

**Medium** (rich DTO + parent/child mapping + attribution correctness).

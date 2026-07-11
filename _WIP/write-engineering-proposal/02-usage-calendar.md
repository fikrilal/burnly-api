# Engineering Proposal: `GET /v1/usage/calendar`

## Status

Draft — Phase 2 web read path.  
**Date:** 2026-07-16  
**Parent:** `docs/planning/cloud-sync-backend-handoff.md` (Phase 2; History calendar mapping)  
**Depends on:** Phase 1 collect; shared usage-read helpers  
**Does not authorize implementation** until accepted.

## Summary / recommendation

Add an authenticated calendar/heatmap API that returns **per-day parent token totals** for a closed date range and reporting timezone. **Dense** day array (zeros for empty days). No model children. Multi-device **sum** by default.

This endpoint, with day detail, is the **minimum Phase 2 exit criterion** for web dashboard MVP.

## Context and problem

### Current behavior

- Handoff maps **History calendar** → `daily_usage_facts.total_tokens` by date.
- Indexes for `(userId, aggregationTimezone, usageDate)` already exist on `DailyUsageFact`.
- No read API; web cannot paint a heatmap from cloud data.

### Desired outcome

One request yields a date series suitable for heatmap / streak UI without over-fetching model breakdowns.

## Goals

- Daily cells: `date`, summed `totalTokens`, contributor `factCount`, activity flag.
- Inclusive `from`/`to` with a hard max range (366 days).
- Same auth, isolation, and parent-authority rules as summary.

## Non-goals

| Out of scope                   | Why                                      |
| ------------------------------ | ---------------------------------------- |
| Model children                 | Day detail / models endpoints            |
| Per-day source breakdown in v1 | Day detail `bySource` or later extension |
| Cost-on-cell                   | Heatmap is tokens-first                  |
| Sparse response                | Dense is simpler for heatmap clients     |

## Constraints and invariants

1. Group by `usageDate` only after filtering `recordState = active` and matching `aggregationTimezone`.
2. Multi-device same date → **one cell**, summed tokens (ADR 0021 option C).
3. Do **not** join `DailyModelUsageFact`.
4. Max range 366 days inclusive → `VALIDATION_FAILED` if exceeded or `to < from`.
5. Reuse `isUsageDateString` / `usageDateToUtcDate` from `libs/features/usage-sync/domain/calendar-date.ts`.

## Proposed design

### Contract

```http
GET /v1/usage/calendar?from=2026-06-01&to=2026-07-09&timezone=Asia/Jakarta&deviceId={optional}
Authorization: Bearer <accessToken>
```

| Query      | Required | Notes                                     |
| ---------- | -------- | ----------------------------------------- |
| `from`     | yes      | `YYYY-MM-DD` inclusive                    |
| `to`       | yes      | `YYYY-MM-DD` inclusive; must be `>= from` |
| `timezone` | yes      | IANA; filters `aggregationTimezone`       |
| `deviceId` | no       | `clientDeviceId` filter                   |

`operationId`: `usage.calendar.get`  
Tag: **`Usage`**

### Response (`200`)

```json
{
  "data": {
    "timezone": "Asia/Jakarta",
    "from": "2026-06-01",
    "to": "2026-07-09",
    "deviceFilter": null,
    "days": [
      {
        "date": "2026-06-01",
        "totalTokens": 0,
        "factCount": 0,
        "active": false
      },
      {
        "date": "2026-06-02",
        "totalTokens": 2100,
        "factCount": 2,
        "active": true
      }
    ]
  },
  "meta": {
    "dayCount": 39
  }
}
```

| Field         | Meaning                                                   |
| ------------- | --------------------------------------------------------- |
| `totalTokens` | Sum of parent totals for that date                        |
| `factCount`   | Number of active parent facts contributing                |
| `active`      | `factCount > 0` (or `totalTokens > 0`) for streak/heatmap |

### Error codes

| Code                    | When                                         |
| ----------------------- | -------------------------------------------- |
| `VALIDATION_FAILED`     | Bad dates, range too large, invalid timezone |
| `UNAUTHORIZED`          | Auth                                         |
| `SYNC_DEVICE_NOT_FOUND` | device filter miss                           |
| `INTERNAL`              | Unexpected                                   |

### Aggregation

1. Query group-by:

   ```sql
   SELECT usage_date, SUM(total_tokens)::bigint, COUNT(*)::int
   FROM daily_usage_facts
   WHERE user_id = $user
     AND record_state = 'active'
     AND aggregation_timezone = $tz
     AND usage_date BETWEEN $from AND $to
     AND ($device IS NULL OR device_id = $device)
   GROUP BY usage_date
   ORDER BY usage_date;
   ```

2. Expand to dense series in pure domain helper (date walk from `from` to `to`); do not require `Clock` for expansion.
3. Optional device: resolve `clientDeviceId` → internal `deviceId` once via existing devices repository patterns.

### Ownership and placement

```text
app/get-usage-calendar.service.ts
domain/dense-date-series.ts          # pure fill helper (optional name)
infra/http/usage-calendar.controller.ts
infra/http/dtos/usage-calendar.dto.ts
ports/usage-read.repository.ts       # sumByDate / groupByUsageDate
```

### Runtime flow

```text
Controller -> GetUsageCalendarService
  validate range + timezone
  resolve optional device
  repo.groupTotalsByDate(...)
  denseFill(from, to, sparseRows)
  return { data, meta.dayCount }
```

## Alternatives considered

| Option                      | Verdict                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| Sparse days only            | Rejected for v1 — heatmap clients re-fill anyway; dense is cheap at ≤366 |
| Include cost micros per day | Defer; tokens drive heatmap                                              |
| Pagination                  | Unnecessary at 366 cap                                                   |

## Material risks

| Risk                                             | Mitigation                                        |
| ------------------------------------------------ | ------------------------------------------------- |
| Client assumes ISO week alignment of `from`/`to` | Client owns range; API is dumb inclusive window   |
| Large multi-device fact counts                   | Index-backed group-by; no model join              |
| Timezone mismatch → all-zero calendar            | Document + UI copy to set reporting tz on desktop |

## Acceptance criteria

- [ ] Inclusive dense series length = days between `from` and `to`.
- [ ] Cell totals match sum of active parents for that date/tz (multi-device sum verified in e2e).
- [ ] Removed facts excluded; other timezones excluded.
- [ ] Range > 366 or invalid dates → `VALIDATION_FAILED`.
- [ ] OpenAPI + unit + e2e (push two days / two devices → cells).

## Open questions

| Topic               | Recommended default |
| ------------------- | ------------------- |
| `active` definition | `factCount > 0`     |
| Max range           | 366 days            |

## Effort

**Small–medium** after shared read repository; strong candidate for first usage-read PR with day detail.

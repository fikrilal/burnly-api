# Engineering Proposal: `GET /v1/usage/models`

## Status

Draft — Phase 2 web read path.  
**Date:** 2026-07-16  
**Parent:** `docs/planning/cloud-sync-backend-handoff.md` (Phase 2; Model breakdown mapping)  
**Depends on:** Phase 1 collect; day-detail attribution semantics  
**Does not authorize implementation** until accepted.

## Summary / recommendation

Add a **range model allocation** endpoint for charts: aggregate `DailyModelUsageFact` children over a date range, always paired with **parent-based** period totals and an explicit **unattributed** remainder.

UI pie/bar charts must use `parentTotalTokens` as 100% baseline, not `modelsSumTokens`.

## Context and problem

### Current behavior

- Model children are stored with `modelIdentityKey` unique per parent (`@@unique([dailyUsageFactId, modelIdentityKey])`).
- Handoff: “Model breakdown → group by model fields; disclose unattributed remainder.”
- ADR 0021: model rows must never replace parent totals in read APIs.
- No range aggregation API yet; day detail only covers one day if implemented first.

### Desired outcome

Web can render model allocation for week/month/custom range without downloading every parent graph.

## Goals

- Range query with same filters as calendar (`from`, `to`, `timezone`, optional `deviceId`, optional `sourceKey`).
- Group models across parents/devices by stable `modelIdentityKey`.
- Return parent totals + models list + attribution math.
- Aggregate in SQL where practical (avoid loading full graphs for 366 days).

## Non-goals

| Out of scope                     | Why                               |
| -------------------------------- | --------------------------------- |
| Models as period total authority | Forbidden                         |
| Per-day model matrix             | Day detail or future              |
| Cost-primary charts              | Tokens first; cost optional later |
| Server re-bucketing timezone     | Same as other reads               |

## Constraints and invariants

```text
parentTotalTokens  = SUM(parent.totalTokens) for matching active parents
modelsSumTokens    = SUM(model.totalTokens) for children of those parents
                     (null model.totalTokens → 0 for sum only)
unattributedTokens = max(0, parentTotalTokens - modelsSumTokens)
```

- Max range 366 days (same as calendar).
- Optional `sourceKey` filters parents before joining children.
- Grouping key: **`modelIdentityKey`** (already on table; handles null raw model bucket).

## Proposed design

### Contract

```http
GET /v1/usage/models?from=2026-07-01&to=2026-07-09&timezone=Asia/Jakarta&deviceId={optional}&sourceKey={optional}
Authorization: Bearer <accessToken>
```

| Query         | Required | Notes                                |
| ------------- | -------- | ------------------------------------ |
| `from` / `to` | yes      | Inclusive `YYYY-MM-DD`; max 366 days |
| `timezone`    | yes      | Filters parent `aggregationTimezone` |
| `deviceId`    | no       | `clientDeviceId`                     |
| `sourceKey`   | no       | Restrict to one product source       |

`operationId`: `usage.models.list`  
Tag: **`Usage`**

### Response (`200`)

```json
{
  "data": {
    "timezone": "Asia/Jakarta",
    "from": "2026-07-01",
    "to": "2026-07-09",
    "deviceFilter": null,
    "sourceFilter": null,
    "parentTotals": {
      "totalTokens": 100000,
      "factCount": 40
    },
    "models": [
      {
        "modelIdentityKey": "claude-sonnet-4",
        "rawModelId": "claude-sonnet-4",
        "displayName": null,
        "providerKey": "anthropic",
        "totalTokens": 80000,
        "inputTokens": 50000,
        "outputTokens": 30000,
        "cacheCreationTokens": 0,
        "cacheReadTokens": 0
      },
      {
        "modelIdentityKey": "UNKNOWN",
        "rawModelId": null,
        "displayName": null,
        "providerKey": null,
        "totalTokens": 5000
      }
    ],
    "attribution": {
      "modelsSumTokens": 85000,
      "parentTotalTokens": 100000,
      "unattributedTokens": 15000
    }
  }
}
```

(Use the same unknown-model sentinel string already defined in `model-identity.ts` / collect path — do not invent a second key.)

### Error codes

| Code                    | When                                 |
| ----------------------- | ------------------------------------ |
| `VALIDATION_FAILED`     | Dates/range/timezone/sourceKey shape |
| `UNAUTHORIZED`          | Auth                                 |
| `SYNC_DEVICE_NOT_FOUND` | device filter                        |
| `INTERNAL`              | Unexpected                           |

### Aggregation rules

1. Select matching active parents (calendar filters + optional `sourceKey`).
2. Sum parent `totalTokens` / count for `parentTotals`.
3. Aggregate children of those parents:

   ```sql
   SELECT m.model_identity_key,
          -- pick display fields via MAX/arbitrary non-null strategy
          SUM(m.total_tokens),
          SUM(m.input_tokens), ...
   FROM daily_model_usage_facts m
   WHERE m.daily_usage_fact_id = ANY($parent_ids)
   GROUP BY m.model_identity_key
   ORDER BY SUM(m.total_tokens) DESC NULLS LAST;
   ```

4. `displayName` / `providerKey` / `rawModelId`: prefer values from the child row with latest parent `clientLastSeenAt` (or any non-null) — document choice.
5. Share pure attribution helper with day detail.

### Ownership and placement

```text
app/get-usage-models.service.ts
app/model-attribution.ts              # shared
infra/http/usage-models.controller.ts
infra/http/dtos/usage-models.dto.ts
ports/usage-read.repository.ts
  sumParentTotalsForRange(...)
  aggregateModelsForParents(...)
```

### Runtime flow

```text
Controller -> GetUsageModelsService
  validate range + filters
  resolve optional device
  parentTotals = repo.sumParents
  models = repo.aggregateModels (by modelIdentityKey)
  attribution = pure(parentTotals, modelsSum)
  return { data }
```

## Alternatives considered

| Option                                | Verdict                                             |
| ------------------------------------- | --------------------------------------------------- |
| Group only by `rawModelId`            | Weaker — null bucket and identity key already exist |
| Return models without parentTotals    | Rejected — UI would misuse models as 100%           |
| Client-side aggregation from day GETs | Rejected for range performance                      |

## Material risks

| Risk                                    | Mitigation                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Double-counting mental model            | Attribution fields mandatory in contract examples                            |
| Large parent id lists                   | Prefer SQL join on filtered parents subquery rather than huge `IN` if needed |
| Inconsistent display names for same key | Document “latest parent wins”                                                |

## Acceptance criteria

- [ ] `attribution.parentTotalTokens` equals sum of active parents for filters.
- [ ] `unattributedTokens` correct when children incomplete or missing.
- [ ] Multi-device: same model key sums across devices.
- [ ] `sourceKey` filter restricts both parent totals and model set.
- [ ] Unit tests for attribution edge cases; e2e from push fixtures; OpenAPI examples.

## Open questions

| Topic                | Recommended default                |
| -------------------- | ---------------------------------- |
| Cost on models range | Omit v1; add v1.1 if product needs |
| Sort order           | `totalTokens` DESC                 |

## Effort

**Medium** — correctness of attribution and SQL aggregation are the main risks.

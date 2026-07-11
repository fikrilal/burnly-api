# Engineering Proposal: Usage sources range APIs (`/v1/usage/sources`)

## Status

Draft — Phase 2 extension (tool-centric range reads).  
**Date:** 2026-07-16  
**Parent:** `docs/planning/cloud-sync-backend-handoff.md` (web source / model breakdown mapping)  
**Depends on:** Phase 2 usage read foundation + shipped `GET /v1/usage/*` endpoints  
**Does not authorize implementation** until accepted.

## Summary / recommendation

Add **first-class source (coding tool) range APIs** under `/v1/usage/sources` so the web can answer:

1. **How much usage per tool** over a date range (`claude-code`, `codex`, `opencode`, …)?
2. **Model breakdown inside each tool** for that same range, with parent-authority attribution?

**Do not** overload `GET /v1/usage/models` with a nested `groupBy=source` mode. Treat **sources as a product resource** so later tool-level UX (labels, filters, experimental flags, tool settings) has a stable home.

Keep existing endpoints:

| Endpoint                             | Continues to own                                                 |
| ------------------------------------ | ---------------------------------------------------------------- |
| `GET /v1/usage/days/{date}`          | Single-day tools + models nested                                 |
| `GET /v1/usage/models`               | Flat / cross-tool model allocation (optional `sourceKey` filter) |
| `GET /v1/usage/calendar` / `summary` | Aggregate chrome, no tool matrix required                        |

## Context and problem

### Current behavior (shipped)

Cloud stores daily parents with opaque product **`sourceKey`** and child **model** rows (`DailyUsageFact` / `DailyModelUsageFact`). Multi-device policy is sum of active parents (ADR 0021).

| Need                                                       | Today                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Per-tool + models for **one day**                          | `GET /v1/usage/days/{date}` → `bySource` + `facts[].sourceKey` + `models[]` |
| Models for **one tool over a range**                       | `GET /v1/usage/models?sourceKey=…&from&to` (N calls if many tools)          |
| Flat models **across tools** over a range                  | `GET /v1/usage/models`                                                      |
| Per-tool bars over a range **without** N round-trips       | **Missing**                                                                 |
| Nested tree **tools → models** for a range in one response | **Missing**                                                                 |

Web product language is tool-first (“Claude Code vs Codex vs OpenCode”), then models inside a tool. Client multi-call of `/usage/models?sourceKey=` is workable for prototypes but poor as a stable contract (unknown source set, more latency, harder caching).

### Desired outcome

One authenticated range surface for **source list** and **source-scoped model breakdown**, reusing the same filters and authority rules as calendar/models.

## Goals

- List distinct tools with **parent** token totals over an inclusive date range.
- Optionally (or via sub-resource) return **model allocation under each tool** with unattributed remainder **per tool**.
- Same auth, timezone filter, multi-device sum, active-only defaults as other usage reads.
- Forward-compatible with new/unknown `sourceKey` strings (no crash; no closed server enum required for v1).
- Room to extend source-level fields later without reshaping `/usage/models`.

## Non-goals

| Out of scope                                 | Why                                                          |
| -------------------------------------------- | ------------------------------------------------------------ |
| New Prisma tables for a source registry      | v1 aggregates from facts; catalog can live on clients        |
| Write APIs (enable/disable tools, rename)    | Product later; separate proposal                             |
| Server display-name dictionary for all tools | Web can map known keys; raw `sourceKey` is enough for v1     |
| Replacing day detail or flat models          | Complementary, not a replacement                             |
| Cost-primary source charts                   | Tokens first (cost can follow summary rules later)           |
| Schema migration                             | Existing indexes on `(userId, sourceKey, usageDate)` suffice |

## Constraints and invariants

1. **Parent authority** — tool `totalTokens` = `SUM(DailyUsageFact.totalTokens)` for matching active parents; **never** sum model children for tool totals (ADR 0021).
2. **Per-tool model attribution:**

   ```text
   toolParentTotalTokens  = SUM(parent.totalTokens) WHERE sourceKey = S
   modelsSumTokens        = SUM(model.totalTokens) for children of those parents
                            (null model totalTokens → 0 for sum)
   unattributedTokens     = max(0, toolParentTotalTokens - modelsSumTokens)
   ```

3. **User isolation** — `userId = principal.userId` only.
4. **Timezone** — exact match on `aggregationTimezone`; no re-bucketing.
5. **Multi-device** — default sum; optional `deviceId` = public `clientDeviceId`.
6. **Range** — inclusive `from`/`to`, max **366** days (same as calendar/models).
7. **Layering** — extend `libs/features/usage-sync/` (`app` + `infra/http` + read repository methods).
8. **Envelope / errors** — `{ data, meta? }`; RFC7807 with `code` + `traceId`.

## Alternatives considered

| Option                                                                     | Verdict                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A.** `GET /v1/usage/models?groupBy=source`                               | Rejected as long-term primary — overloads models resource; weaker home for tool-only features |
| **B.** `GET /v1/usage/sources` (+ models sub-resource or `include=models`) | **Accepted** — first-class tools; extensible                                                  |
| **C.** Client multi-call `/usage/models?sourceKey=` only                   | Acceptable prototype; not the durable product contract                                        |
| Materialize `usage_sources` dimension table                                | Deferred until product needs server-owned catalog/metadata                                    |

## Proposed design

### Endpoint set (v1)

Two routes (clear REST, easy OpenAPI). Nested UI can call list + one models request per selected tool, **or** use optional include on list (see open questions).

#### 1) List sources for a range

```http
GET /v1/usage/sources?from=2026-07-01&to=2026-07-09&timezone=Asia/Jakarta&deviceId={optional}
Authorization: Bearer <accessToken>
```

| Query         | Required | Notes                                |
| ------------- | -------- | ------------------------------------ |
| `from` / `to` | yes      | Inclusive `YYYY-MM-DD`; max 366 days |
| `timezone`    | yes      | IANA; filters `aggregationTimezone`  |
| `deviceId`    | no       | `clientDeviceId` filter              |

`operationId`: `usage.sources.list`  
Tag: **`Usage`**

**Response (`200`):**

```json
{
  "data": {
    "timezone": "Asia/Jakarta",
    "from": "2026-07-01",
    "to": "2026-07-09",
    "deviceFilter": null,
    "parentTotals": {
      "totalTokens": 100000,
      "factCount": 40
    },
    "sources": [
      {
        "sourceKey": "claude-code",
        "totalTokens": 70000,
        "factCount": 20
      },
      {
        "sourceKey": "codex",
        "totalTokens": 30000,
        "factCount": 12
      }
    ]
  },
  "meta": {
    "sourceCount": 2
  }
}
```

| Field                   | Meaning                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `parentTotals`          | Account-level sum of active parents in the window (all tools) |
| `sources[].totalTokens` | Parent sum for that `sourceKey` only                          |
| `sources[].factCount`   | Active parent facts contributing to that tool                 |
| Sort                    | `totalTokens` DESC, then `sourceKey` ASC                      |

Empty window: `sources: []`, `parentTotals` zeros, `sourceCount: 0`.

#### 2) Models under one source for a range

```http
GET /v1/usage/sources/{sourceKey}/models?from=2026-07-01&to=2026-07-09&timezone=Asia/Jakarta&deviceId={optional}
Authorization: Bearer <accessToken>
```

| Param                                   | Required     | Notes                                                                                |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `sourceKey` (path)                      | yes          | Product source string (URL-encoded if needed); max length align schema `VarChar(64)` |
| `from` / `to` / `timezone` / `deviceId` | same as list |                                                                                      |

`operationId`: `usage.sources.models.list`  
Tag: **`Usage`**

**Response (`200`):**

```json
{
  "data": {
    "timezone": "Asia/Jakarta",
    "from": "2026-07-01",
    "to": "2026-07-09",
    "deviceFilter": null,
    "sourceKey": "claude-code",
    "parentTotals": {
      "totalTokens": 70000,
      "factCount": 20
    },
    "models": [
      {
        "modelIdentityKey": "claude-sonnet-4",
        "rawModelId": "claude-sonnet-4",
        "displayName": null,
        "providerKey": "anthropic",
        "totalTokens": 65000,
        "inputTokens": 40000,
        "outputTokens": 25000,
        "cacheCreationTokens": 0,
        "cacheReadTokens": 0
      },
      {
        "modelIdentityKey": "__unknown__",
        "rawModelId": null,
        "displayName": null,
        "providerKey": null,
        "totalTokens": 1000
      }
    ],
    "attribution": {
      "modelsSumTokens": 66000,
      "parentTotalTokens": 70000,
      "unattributedTokens": 4000
    }
  }
}
```

Semantics match `GET /v1/usage/models` **restricted to this source** (reuse `sumParentTotals` + `aggregateModelsByIdentity` with `sourceKey`).

**Empty / unknown source:** still `200` with zero `parentTotals`, empty `models`, full unattributed 0 — **not** 404. Reasons:

- Clients often probe tools from a static list.
- Avoid timing/existence leaks about rare source keys (low risk, but consistent with empty day detail).

### Optional v1.1: nested include on list

If product needs one round-trip for “all tools with models”:

```http
GET /v1/usage/sources?from&to&timezone&include=models
```

Each `sources[]` entry gains `models[]` + `attribution` (same math as sub-resource). Cap risk: many tools × models; keep max range 366 and document payload size. **Recommend ship list + sub-resource first**; add `include=models` only if web latency requires it.

### Error codes

| Code                    | When                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `VALIDATION_FAILED`     | Bad dates, range > 366, invalid timezone, bad `sourceKey` shape/length |
| `UNAUTHORIZED`          | Auth                                                                   |
| `SYNC_DEVICE_NOT_FOUND` | `deviceId` filter not owned                                            |
| `INTERNAL`              | Unexpected                                                             |

### Data access

Reuse / extend `UsageReadRepository`:

| Method                                                           | Use                            |
| ---------------------------------------------------------------- | ------------------------------ |
| `sumParentTotals(scope, from, to)`                               | Account `parentTotals` on list |
| **New** `groupParentTotalsBySource(scope, from, to)`             | List sources sparse rows       |
| Existing `sumParentTotals(scope, from, to, sourceKey)`           | Source models parent totals    |
| Existing `aggregateModelsByIdentity(scope, from, to, sourceKey)` | Source models list             |

SQL sketch for list:

```sql
SELECT source_key,
       SUM(total_tokens)::bigint,
       COUNT(*)::int
FROM daily_usage_facts
WHERE user_id = $user
  AND record_state = 'active'
  AND aggregation_timezone = $tz
  AND usage_date BETWEEN $from AND $to
  AND ($device IS NULL OR device_id = $device)
GROUP BY source_key
ORDER BY SUM(total_tokens) DESC, source_key ASC;
```

Index already present: `(userId, sourceKey, usageDate)` plus timezone/date indexes used by other reads.

### Ownership and placement

```text
libs/features/usage-sync/
  app/
    get-usage-sources.service.ts          # list
    get-usage-source-models.service.ts    # models under source
    # or one service with two execute methods
  infra/http/
    usage-sources.controller.ts
    dtos/usage-sources.dto.ts
  app/ports/usage-read.repository.ts      # + groupParentTotalsBySource
  infra/persistence/prisma-usage-read.repository.ts
```

- Controllers: `@ApiTags('Usage')`, `@Controller('usage')`, `AccessTokenGuard`, existing `UsageSyncErrorFilter`.
- No Prisma in app services; inject read + devices repos like calendar/models.
- Reuse: `parseUsageDateRange`, `parseUsageTimezone`, `resolveOptionalClientDeviceId`, `computeModelAttribution`, `bigintToJsonNumber`.

### Runtime flow

```text
List:
  Controller -> GetUsageSourcesService
    validate range + timezone + optional device
    resolve clientDeviceId
    parentTotals = sumParentTotals(scope, range)
    rows = groupParentTotalsBySource(scope, range)
    return { data, meta.sourceCount }

Models under source:
  Controller -> GetUsageSourceModelsService
    validate range + timezone + sourceKey + optional device
    resolve clientDeviceId
    parentTotals = sumParentTotals(scope, range, sourceKey)
    models = aggregateModelsByIdentity(scope, range, sourceKey)
    attribution = computeModelAttribution(...)
    return { data }
```

### Relationship to day detail

| Surface                     | When                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| Calendar cell click         | Prefer **day detail** (already nested tools+models for one date) |
| History “this week by tool” | **sources list**                                                 |
| Expand one tool over week   | **sources/{sourceKey}/models**                                   |
| Cross-tool model pie        | Keep **usage/models**                                            |

Clients should not rebuild week tool totals by N day-detail calls when sources list exists.

### Extensibility (document only; not v1)

Future fields that fit **on this resource** without a new feature package:

- `displayName` / `productStatus` (supported vs experimental) from a versioned allowlist
- `lastSeenAt` max client last seen for that source in window
- `activeDays` count for streaks per tool
- User preferences “pin tool order” (would need storage + write API — separate proposal)

## Material risks and tradeoffs

| Risk                                        | Mitigation                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Duplication with `/usage/models?sourceKey=` | Document models endpoint as flat/cross-tool; sources as tool tree; implement models-under-source by reusing same repo methods |
| Large nested `include=models` payloads      | Ship without include first; or hard-cap sources returned (unlikely)                                                           |
| Unknown/experimental tools flood UI         | Return all observed keys; client can hide experimental list                                                                   |
| Path encoding for odd `sourceKey`           | Document URL-encoding; restrict charset if collect already does                                                               |

## Acceptance criteria

- [ ] `GET /v1/usage/sources` returns parent-based per-`sourceKey` totals matching SQL group-by for the window.
- [ ] Multi-device: same tool on two devices **sums** into one source row unless `deviceId` filter is set.
- [ ] Removed facts excluded; other timezones excluded.
- [ ] `GET /v1/usage/sources/{sourceKey}/models` attribution math matches day-detail / models invariants for that tool window.
- [ ] Empty range and unknown `sourceKey` → `200` with zeros/empty arrays (not 404).
- [ ] Range validation and `SYNC_DEVICE_NOT_FOUND` parity with calendar/models.
- [ ] Unit tests for grouping + attribution; e2e: push multi-source fixtures → list + models sub-resource.
- [ ] OpenAPI snapshot + Spectral; operationIds present under tag `Usage`.
- [ ] No Prisma schema migration.

## Open questions

| Topic                                    | Recommended default                                                 |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Ship `include=models` in first PR?       | **No** — list + `/{sourceKey}/models` first                         |
| Category token sums on source list rows? | **Omit v1** (totalTokens + factCount only); add if charts need them |
| Cap number of sources returned?          | No hard cap for v1 (observed keys per user stay small)              |
| Deprecate `sourceKey` on flat models?    | **Keep** — useful for single-tool model chart without path param    |

## Effort

**Small–medium** once read foundation exists:

- One new repo method (`groupParentTotalsBySource`)
- Two handlers (or one controller, two methods)
- Heavy reuse of models aggregation path for sub-resource

## Related documents

| Doc                                           | Role                                                    |
| --------------------------------------------- | ------------------------------------------------------- |
| `README.md` (this folder)                     | Phase 2 index                                           |
| `03-usage-day-detail.md`                      | Single-day nested tools + models (shipped)              |
| `04-usage-models.md`                          | Flat range models (shipped)                             |
| ADR `0020`, `0021`                            | Projection + identity / multi-device / parent authority |
| `docs/planning/cloud-sync-backend-handoff.md` | Source breakdown mapping for web                        |

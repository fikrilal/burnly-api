# Usage / sync read API engineering proposals

**Status:** draft folder (not normative until promoted to `docs/planning/` or accepted via ADR)  
**Updated:** 2026-07-16  
**Does not authorize implementation** by itself.

## Sources of truth

| Source                                        | Role                                                               |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `docs/planning/cloud-sync-backend-handoff.md` | Product endpoints + web mapping                                    |
| ADR `0020`                                    | Cloud = daily-usage projection; privacy boundary                   |
| ADR `0021`                                    | Identity keys, multi-device **sum**, parent totals authority       |
| `prisma/schema.prisma`                        | `SyncDevice`, `DailyUsageFact`, `DailyModelUsageFact`, `SyncBatch` |
| `libs/features/usage-sync/`                   | Collect write path + Phase 2 read APIs                             |
| `docs/standards/api-response-standard.md`     | `{ data, meta? }` envelope                                         |
| `docs/guide/adding-an-endpoint.md`            | Guards, OpenAPI, e2e shape                                         |

## Implementation status (code on `development`)

Phase 1 collect + Phase 2 baseline read path are **implemented** (see git history). Proposal markdown here may still say “Draft” until edited.

| #   | Scope                                               | Proposal                      | Code                    |
| --- | --------------------------------------------------- | ----------------------------- | ----------------------- |
| 0   | Shared read foundation                              | `00-usage-read-foundation.md` | Done                    |
| 1   | `GET /v1/usage/summary`                             | `01-usage-summary.md`         | Done                    |
| 2   | `GET /v1/usage/calendar`                            | `02-usage-calendar.md`        | Done                    |
| 3   | `GET /v1/usage/days/{date}`                         | `03-usage-day-detail.md`      | Done                    |
| 4   | `GET /v1/usage/models`                              | `04-usage-models.md`          | Done                    |
| 5   | `GET /v1/sync/status`                               | `05-sync-status.md`           | Done                    |
| 6   | **`GET /v1/usage/sources` (+ models under source)** | `06-usage-sources.md`         | Done |

## Shared product rules (all usage reads)

| Rule             | Choice                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Auth             | `AccessTokenGuard` + bearer; **user-scoped only**                                              |
| Totals authority | Parent `DailyUsageFact.totalTokens` only — **never** sum model children for tool/period totals |
| Multi-device     | Default: **sum** active facts; optional `deviceId` = `clientDeviceId`                          |
| Soft-removed     | Exclude `recordState = removed` from aggregates                                                |
| Timezone         | Exact match on fact `aggregationTimezone`; no re-bucketing in v1                               |
| Envelope         | Success `{ data, meta? }`; errors RFC7807 + `code` + `traceId`                                 |
| Feature slice    | Extend `libs/features/usage-sync/` only                                                        |

## Why proposal 06 (sources)

Day detail already nests tools + models for **one date**. Flat `/usage/models` covers cross-tool model pies and optional `sourceKey` filter.

Missing durable contract: **range tool list** and **tool → models** without N client calls or overloading models with `groupBy=source`.

**Decision:** Option B — first-class `/v1/usage/sources` resource (see `06-usage-sources.md`).

## Suggested next implementation

1. Implement `06-usage-sources.md` (list + `/{sourceKey}/models`).
2. Optionally later: `include=models` on list for one-shot nested payloads.
3. Promote accepted proposals under `docs/planning/` when ready.

## Non-goals (still deferred)

- Leaderboard / public profiles
- Session explorer
- Project paths / fingerprints
- Desktop client work
- Server-owned source catalog table (unless product requires it later)

## Promotion path

When accepted: move or copy under `docs/planning/` and optionally open an exec-plan under `docs/exec-plans/active/`. New ADR only if multi-device or totals authority changes (already locked in 0020/0021).

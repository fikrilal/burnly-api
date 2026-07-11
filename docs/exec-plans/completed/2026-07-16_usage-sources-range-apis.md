# Usage sources range APIs (`/v1/usage/sources`)

Date: 2026-07-16  
Owner: agent  
Status: completed  
Risk class: medium  
Related issue/PR: N/A  
Proposal: `_WIP/write-engineering-proposal/06-usage-sources.md`

## Objective

Ship authenticated range APIs so web can list **per-tool (sourceKey) parent totals** and **model breakdown under one tool** for an inclusive date window.

Delivered:

```http
GET /v1/usage/sources?from&to&timezone&deviceId={optional}
GET /v1/usage/sources/{sourceKey}/models?from&to&timezone&deviceId={optional}
```

## Constraints

- Architecture: extend `libs/features/usage-sync/` only; infra → app → domain.
- Product/runtime: parent `totalTokens` authority (ADR 0021); multi-device sum; active-only; exact `aggregationTimezone`; max 366-day range; no schema migration.
- Out of scope: `include=models` nested list, source registry table, write/settings.

## Impact Areas

- API/OpenAPI: **yes**
- DB/Prisma/migrations: no
- Auth/session: bearer guard only

## Acceptance Criteria

1. List returns parent-based per-`sourceKey` totals + account `parentTotals` — **met**
2. Multi-device sums; `deviceId` isolates — **met** (e2e)
3. Models sub-resource attribution — **met** (e2e unattributed remainder)
4. Empty / unknown sourceKey → `200` empty — **met**
5. Validation + `SYNC_DEVICE_NOT_FOUND` parity — **met**
6. Unit + e2e + OpenAPI + `npm run verify` — **met**

## Implementation Checklist

- [x] `groupParentTotalsBySource` on `UsageReadRepository` + Prisma
- [x] `GetUsageSourcesService` + unit tests
- [x] `GetUsageSourceModelsService` + unit tests
- [x] Controller + DTOs; module wiring
- [x] e2e multi-source fixtures
- [x] openapi generate/check/lint
- [x] `npm run verify`

## Decision Log

- 2026-07-16: Option B (`/usage/sources`) over models `groupBy`.
- 2026-07-16: v1 list + `/{sourceKey}/models` only; defer `include=models`.
- 2026-07-16: Unknown sourceKey → empty 200 (not 404).

## Verification

```bash
npm run verify
# format:check, lint, typecheck, verify:env, deps:check, unit tests (339), openapi:check, openapi:lint — pass

export DATABASE_URL=… REDIS_URL=…
npm run test:e2e -- --testPathPatterns='usage-sync-sources'
# 3 passed
```

## Runtime Evidence

- Environment: local e2e harness (Postgres + Redis)
- Flow: register → devices → multi-source push → GET `/v1/usage/sources` and `/v1/usage/sources/claude-code/models`
- Routes mapped: `UsageSourcesController {/v1/usage}` sources + sources/:sourceKey/models

## Risks And Mitigations

- Duplication with `/usage/models?sourceKey=` — reuses same repo methods; documented as complementary.
- Lint no-`as` rule — test doubles helper + e2e object-array helpers.

## Completion Notes

Shipped tool-centric range APIs:

| Method | Path | operationId |
| ------ | ---- | ----------- |
| GET | `/v1/usage/sources` | `usage.sources.list` |
| GET | `/v1/usage/sources/{sourceKey}/models` | `usage.sources.models.list` |

Key files: `get-usage-sources.service.ts`, `get-usage-source-models.service.ts`, `usage-sources.controller.ts`, `groupParentTotalsBySource` in Prisma read repo.

## Follow-Ups

- [ ] Optional `include=models` on list (v1.1)
- [ ] Promote `06-usage-sources.md` to `docs/planning/` when accepted

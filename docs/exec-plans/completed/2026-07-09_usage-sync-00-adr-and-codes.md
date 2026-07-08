# Usage Sync Phase A — ADR and Error Codes

Date: 2026-07-09  
Owner: burnly-api  
Status: completed  
Risk class: low  
Related issue/PR: N/A

## Objective

Freeze collect-path product and architecture decisions before schema/HTTP work
(Phase B+), and introduce typed feature error codes for sync.

Parent plan: `docs/planning/desktop-collect-implementation-plan.md` (Phase A).  
Contract source: `docs/planning/desktop-collect-api-requirements.md`.

## Constraints

- Architecture constraints: ADRs first; no Prisma models or collect HTTP yet.
- Product/runtime constraints: account = cloud choice; no server `syncEnabled`
  flag; daily aggregates only.
- Out of scope: schema, endpoints, OpenAPI snapshot updates for new routes,
  desktop client.

## Impact Areas

- API/OpenAPI: no (codes only; routes later)
- DB/Prisma/migrations: no
- Auth/session: no behavior change
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: typecheck only

## Acceptance Criteria

1. ADR accepted for daily usage cloud projection + account framing + privacy.
2. ADR accepted for identity keys, device uniqueness, multi-device sum policy,
   rolling-window semantics.
3. `SyncErrorCode` enum exists under `libs/shared` and is part of `AppErrorCode`.
4. Project profile and implementation plan Phase A exit criteria updated.
5. No collect HTTP or Prisma schema changes in this plan.

## Implementation Checklist

- [x] Create this exec plan
- [x] ADR 0020 — daily usage projection / account-driven cloud
- [x] ADR 0021 — identity, multi-device, rolling window
- [x] `SyncErrorCode` + wire into `AppErrorCode`
- [x] Update ADR index, project profile, parent plan checkboxes
- [x] Move this plan to `completed/`

## Decision Log

- Product: account creation/sign-in is the cloud choice; no separate opt-in
  sync toggle for v1 (confirmed with product owner 2026-07-09).
- Two ADRs rather than one: projection/privacy (0020) vs identity/devices (0021).
- Multi-device user totals: sum across devices (0021).
- Rolling push never deletes out-of-window history (0021).

## Verification Evidence

- `npm run typecheck` — passed after wiring `SyncErrorCode` into `AppErrorCode`.

## Follow-ups

- Phase B: Prisma models + migration (next exec plan:
  `usage-sync-01-schema`)

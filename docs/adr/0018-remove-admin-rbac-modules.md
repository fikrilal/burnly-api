# 0018. Remove Admin and RBAC Modules

- Status: Accepted
- Date: 2026-07-06
- Decision makers: Burnly API maintainers

## Context

Burnly is a consumer-facing product backend (desktop + web clients). The inherited template ships an admin control plane (`/v1/admin/*`) and an RBAC platform layer (`libs/platform/rbac/*`) for operational workflows such as user suspension, role changes, and audit review.

Product clients do not consume admin endpoints, and there is no near-term plan for an internal admin dashboard.

## Decision

Remove the admin feature module and RBAC platform module from `burnly-api`.

Consumer-facing endpoints (`/v1/auth/*`, `/v1/me`, profile flows) remain unchanged and continue to use `AccessTokenGuard` only.

## Consequences

- `/v1/admin/*` routes are no longer part of the public API contract.
- `AdminErrorCode` and `libs/shared/admin/*` are removed.
- `docs/engineering/admin/*` is removed.
- OpenAPI snapshot is regenerated without the Admin tag.
- Role simplification deferred to ADR `docs/adr/0019-simplify-consumer-user-role-model.md`.

# 0019. Simplify Consumer User Role Model

- Status: Accepted
- Date: 2026-07-06
- Decision makers: Burnly API maintainers

## Context

After removing admin/RBAC modules (ADR 0018), the database still stored `User.role` (`USER` | `ADMIN`), admin-oriented audit tables, and last-admin account-deletion guards. Burnly has no operational role management and no admin surface.

## Decision

Remove persisted role assignment and related schema:

- drop `User.role` and the `UserRole` enum
- drop `UserRoleChangeAudit`
- drop `UserStatusChangeAudit`
- drop `FINALIZE_BLOCKED_LAST_ADMIN` from account-deletion audit actions
- remove `USERS_CANNOT_DELETE_LAST_ADMIN`

API compatibility:

- access tokens and `GET /me` continue to expose `roles: ["USER"]` via `CONSUMER_USER_ROLES`
- mobile clients keep parsing `MeDto.roles` without changes

## Consequences

- Simpler schema and deletion flows
- No DB-backed role promotion/demotion (not needed for consumer launch)
- `UserStatus` (`ACTIVE` / `SUSPENDED` / `DELETED`) remains for account lifecycle

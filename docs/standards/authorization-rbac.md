# Authorization (Archived Template Standard)

> **Not active in Burnly.** Operational admin/RBAC modules were removed in ADR `docs/adr/0018-remove-admin-rbac-modules.md`. The consumer role model was simplified in ADR `docs/adr/0019-simplify-consumer-user-role-model.md`.

## What Burnly uses instead

- Protected routes authenticate with `AccessTokenGuard` (`Authorization: Bearer <access-token>`).
- Authorization is feature-specific when needed (for example, ensuring `principal.userId` owns the resource).
- Access tokens and `GET /me` expose `roles: ["USER"]` via `CONSUMER_USER_ROLES` for client compatibility. Roles are not stored in Postgres.

See:

- `docs/standards/authentication.md`
- `docs/guide/adding-an-endpoint.md`
- `libs/shared/auth/user-roles.ts`

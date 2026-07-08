# Burnly Project Profile

## Product Context

- Service: `burnly-api`
- Purpose: backend API and worker for Burnly account, optional sync, and web product surfaces
- Baseline architecture: modular monolith with API + worker processes
- Clients:
  - Desktop tray app: `../burnly` (local-first; optional account/sync later)
  - Public web: `../burnly-web` (landing now; reports/leaderboard later)

## Launch Scope

- In scope: auth/session foundation, user profile baseline, platform gates (OpenAPI, health, jobs)
- Near-term product: optional account + aggregate usage sync for web reports
- Out of scope: admin control plane and RBAC-protected operational endpoints (removed; see ADR `docs/adr/0018-remove-admin-rbac-modules.md`)
- Auth mode at launch: password + OIDC (Google Sign-In)

## Enabled Integrations

- Database: PostgreSQL via Prisma
- Queue/cache: Redis + BullMQ
- Observability: OpenTelemetry (OTLP) + structured logs
- Optional integrations supported by template:
  - Email (Resend)
  - Push notifications (FCM) — not required for Burnly v1
  - Object storage (S3-compatible)

## Auth and Session Strategy

- Access tokens: first-party JWT access tokens
- Sessions: refresh-token based sessions with rotation/revocation
- Auth entrypoints: password credentials and Google OIDC token exchange
- Local desktop tracking remains usable without an account

## Data Retention and Deletion Policy

- Initial policy uses template defaults for account deletion and audit events
- Sync must remain opt-in; only selected aggregate metrics may leave the device
- Product-specific retention windows and compliance rules: `TBD` before production

## SLO and SLA Targets

- API availability target: `TBD`
- Auth endpoints latency target: `TBD`
- Background job processing target: `TBD`

## Environments

- Development: local Docker dependencies and Swagger UI enabled (`http://127.0.0.1:4000/v1`)
- Staging: production-like config with explicit proxy/TLS settings
- Production: strict environment validation and managed secret injection

## Known Intentional Deviations

- Admin/RBAC modules removed (ADR `docs/adr/0018-remove-admin-rbac-modules.md`)
- Consumer-only role model: implicit `USER`; API still returns `roles: ["USER"]` (ADR `docs/adr/0019-simplify-consumer-user-role-model.md`)
- Product focus is desktop + web, not a mobile-first consumer app

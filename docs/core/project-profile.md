# Burnly Project Profile

## Product Context

- Service: `burnly-api`
- Purpose: backend API and worker for Burnly account, cloud daily-usage projection, and web product surfaces
- Baseline architecture: modular monolith with API + worker processes
- Clients:
  - Desktop tray app: `../burnly` (local-first; account when user wants web reports)
  - Public web: `../burnly-web` (landing now; reports/leaderboard later)

## Launch Scope

- In scope: auth/session foundation, user profile baseline, platform gates (OpenAPI, health, jobs)
- Near-term product: account-driven **daily usage collect** (desktop push) so web can show history
- Out of scope: admin control plane and RBAC-protected operational endpoints (removed; see ADR `docs/adr/0018-remove-admin-rbac-modules.md`)
- Auth mode at launch: password + OIDC (Google Sign-In)

## Cloud usage framing

- Local desktop tracking needs **no account**.
- Cloud reports require a Burnly **account**; signing in is the cloud choice (no server `syncEnabled` flag in v1).
- Cloud stores a **projection of daily usage facts** (+ model breakdowns), not a full local SQLite mirror.
- ADRs: `docs/adr/0020-daily-usage-cloud-projection.md`, `docs/adr/0021-usage-sync-identity-and-devices.md`
- Collect contract: `docs/planning/desktop-collect-api-requirements.md`
- Implementation roadmap: `docs/planning/desktop-collect-implementation-plan.md`

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
- Desktop should send stable install `deviceId` / `deviceName` on auth when using collect

## Data Retention and Deletion Policy

- Initial policy uses template defaults for account deletion and audit events
- Only aggregate daily metrics (and allowed device metadata) may be stored for signed-in users
- Never store project paths, prompts, code, session ids (v1), or collector raw payloads
- Account deletion must wipe sync devices, daily facts, model facts, and sync batches
- Product-specific cloud retention windows: `TBD` before production (history kept until then)

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

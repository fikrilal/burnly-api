# Project Overview

Burnly API is the **production API and worker service** for [Burnly](https://burnly.dev). It inherits architecture, standards, and platform foundations from the shared backend template and is customized for Burnly account, sync, and web product flows.

## Goals

- Provide a stable `/v1` API contract for Burnly web and optional desktop account/sync clients.
- Ship product features on top of shared platform capabilities:
  - config + secrets handling
  - API envelope + error shape
  - auth (OIDC + password) issuing first-party access+refresh tokens
  - Postgres + migrations + transaction patterns
  - Redis + BullMQ background jobs (separate worker process)
  - observability via OpenTelemetry + structured logs
  - health/readiness endpoints and graceful shutdown
- Keep architectural boundaries clear as product features grow (sync, reports, leaderboard).

## Non-Goals

- Building a generic multi-product backend platform in this repo.
- Replacing the local-first desktop tracker; local usage remains private by default.
- Solving every domain problem (payments, billing, complex multi-tenancy) out of the box.
- Supporting cloud-managed queues (BullMQ + Redis is the default and the only supported queue).
- Shipping an admin/RBAC control plane.

## Intended Use

This repository serves:

- the Burnly public web app (`../burnly-web`)
- the Burnly desktop app (`../burnly`) when the user opts into account/sync
- future public profile or leaderboard surfaces that share the same API contract

Extend the service by adding **features** (vertical slices) rather than changing platform foundations.

## Golden Path (Baseline Capabilities)

1. API server (NestJS + Fastify)

- Versioned routes (e.g., `/v1/*`) and consistent response envelope.
- Generated OpenAPI from code, checked in CI.

2. Worker process (BullMQ)

- Background jobs for email, account deletion, and other async work.

3. Auth + sessions

- Password login/register, Google OIDC exchange, refresh-token sessions.

4. User profile

- `GET /me`, profile image upload, and related account settings.

See `docs/core/project-profile.md` for launch scope and environment notes.

# Burnly API

Backend service for [Burnly](https://burnly.dev) (NestJS + Fastify, Postgres/Prisma, Redis/BullMQ, OpenTelemetry, OpenAPI contract gates).

Documentation is in `docs/README.md` (source of truth).

## What you get

- Two-process baseline: API (`apps/api`) + worker (`apps/worker`)
- API contract discipline:
  - success envelope `{ data, meta? }`
  - errors are RFC7807 (`application/problem+json`) with stable `code` + `traceId`
  - generated OpenAPI snapshot committed at `docs/openapi/openapi.yaml` and linted by Spectral
- Auth + sessions (password + OIDC), idempotency keys, email infra, background jobs
- Clients: local desktop (`../burnly`) and public web (`../burnly-web`)

## Quickstart (local)

- Prereqs:
  - Node `>=22 <23`
  - Docker (for local deps and e2e)
- `cp env.example .env`
- `npm run deps:up` (Postgres + Redis via Docker Compose)
- `npm install`
- `npm run prisma:migrate && npm run prisma:generate`
- `npm run start:dev` (API on `http://127.0.0.1:4000`, Swagger UI at `/docs` in dev)
- `npm run start:worker:dev` (worker on `http://127.0.0.1:4001`)
- `npm run verify` (format/lint/typecheck/boundaries/tests/openapi gates)
- Optional: `npm run verify:e2e` (brings up local deps and runs e2e)

Run all commands natively from your current terminal (no wrapper tooling required).

## Pointers

- Docs index: `docs/README.md`
- Project profile: `docs/core/project-profile.md`
- Engineering notes (integration contracts): `docs/engineering/README.md`

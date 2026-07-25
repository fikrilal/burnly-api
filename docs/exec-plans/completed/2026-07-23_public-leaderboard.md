# Public leaderboard API (opt-in + ranks)

Date: 2026-07-23  
Owner: burnly-api  
Status: completed  
Risk class: **high** (public unauthenticated surface, privacy consent, schema, account wipe)  
Related issue/PR: N/A  
Product input: `docs/planning/leaderboard-api-handoff.md`  
ADR: `docs/adr/0023-public-leaderboard-opt-in.md`

## Objective

Ship backend for a **public global leaderboard** (token metric, UTC windows) with
**explicit opt-in** (default off), authenticated settings on `/v1/me`, OpenAPI,
tests, and public rate limiting — so burnly-web can implement `/leaderboard`
against a stable contract.

Desktop collect path: **no change**.

## Constraints

- Architecture: domain/app/infra layering; `libs/platform/*` must not depend on
  features; dependency-cruiser clean.
- Product/privacy: ADR 0023 — separate consent; never email or ADR 0020
  forbidden fields; opt-out immediate.
- Metric authority: sum parent `DailyUsageFact.totalTokens` only; active facts;
  multi-device account sum.
- Windows: `7d` / `30d` / `all` in **UTC** only.
- Time: use `Clock` (no ad-hoc `Date.now()` in app services).
- Errors: typed codes; no raw string codes.
- Out of scope:
  - burnly-web UI
  - cost / streak metrics
  - friends boards
  - websockets
  - public avatar ACL redesign (name-only rows OK in v1)
  - materialized rank jobs (optional later; on-read OK)

## Impact Areas

| Area                  | Impact                                                     |
| --------------------- | ---------------------------------------------------------- |
| API/OpenAPI           | **yes** — `GET /v1/leaderboard`, extend `GET/PATCH /v1/me` |
| DB/Prisma/migrations  | **yes** — opt-in columns on profile                        |
| Auth/session          | **yes** — public list; optional soft-auth for `viewer`     |
| Queue/jobs            | no (v1 on-read)                                            |
| Env/config/secrets    | maybe — rate limit thresholds if env-driven                |
| Observability         | yes — structured logs; no PII beyond public fields         |
| External integrations | no                                                         |
| CI/release/harness    | yes — e2e + OpenAPI gates                                  |

## Acceptance Criteria

1. Opt-in default **off**; authenticated toggle on/off via me surface.
2. `GET /v1/leaderboard` public; only opted-in users with score **> 0**.
3. Windows `7d` / `30d` / `all` use UTC edges per ADR 0023.
4. Metric `tokens` only; stable order `tokens DESC, userId ASC`; unique ordinal ranks.
5. Row: displayName (fallback never email), optional/null avatarUrl, totalTokens,
   top ≤5 tools, top ≤5 models.
6. No email / device ids / forbidden privacy fields in responses.
7. Opt-out removes user from subsequent public reads.
8. Empty board → `200` + `entries: []`.
9. Public rate limit story (IP Redis limiter; `RATE_LIMITED`).
10. Optional Bearer → `viewer` statuses per ADR (invalid token ≠ 401 on list).
11. Account deletion continues to wipe profile (opt-in) and usage facts; no
    orphaned public rows.
12. OpenAPI snapshot + Spectral + unit/e2e + `npm run verify`.

## PR / implementation slices

Ship in order; each slice should leave main green.

### PR-0 — Docs lock (this plan + ADR)

- [x] ADR 0023 accepted
- [x] Active exec plan
- [x] ADR index + docs README links
- [x] Handoff status points at ADR + plan

### PR-1 — Schema: opt-in flag

- [x] Prisma `UserProfile`:
  - `leaderboardOptIn Boolean @default(false)`
  - `leaderboardOptedInAt DateTime?`
- [x] Migration `20260723120000_leaderboard_opt_in`
- [x] Index on `leaderboardOptIn`
- [x] `prisma:generate` + migrate deploy

### PR-2 — Settings on me

- [x] Extend me view DTO: `leaderboard: { optIn, optedInAt }`
- [x] Extend PATCH me (partial leaderboard.optIn)
  - `true` → set optedInAt via Clock
  - `false` → clear optedInAt; user must leave public ranks immediately
- [x] Unit tests users service/repo
- [x] e2e: register → GET me default off → PATCH on → PATCH off
- [x] OpenAPI generate/check

### PR-3 — Public list (core)

- [x] Feature module `libs/features/leaderboard/`
- [x] Domain: window resolution (UTC), display-name fallback, cursor
- [x] App: `GetLeaderboardService` (+ optional viewer enrichment)
- [x] Infra: Prisma raw aggregates + top tools/models (cap 5)
- [x] HTTP: `GET /v1/leaderboard` public
- [x] Soft optional auth for `viewer` (invalid token ≠ 401)
- [x] Redis IP rate limiter (60/min)
- [x] Unit + e2e tests
- [x] OpenAPI + Spectral
- [x] Account deletion: profile cascade removes opt-in; facts cascade

### PR-4 — Hardening / polish

- [x] Keyset cursor pagination (tokens DESC, userId ASC)
- [x] No response cache in v1 (on-read only)
- [x] bigint JSON number|string parity
- [x] `npm run verify` + e2e leaderboard|auth-me
- [x] Move plan to `completed/`
- [ ] Unresolved follow-ups → tech-debt-tracker if needed

## Suggested file touch points

| Area              | Likely paths                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| Schema            | `prisma/schema.prisma`, `prisma/migrations/*`                             |
| Me / opt-in       | `libs/features/users/**`                                                  |
| Leaderboard slice | `libs/features/leaderboard/{domain,app,infra}/**`                         |
| Module wire       | `apps/api` feature imports                                                |
| Rate limit        | `libs/features/leaderboard/infra/rate-limit/*` (or platform helper reuse) |
| e2e               | `test/leaderboard*.e2e-spec.ts`, me e2e extensions                        |
| OpenAPI           | `docs/openapi/openapi.yaml` (generated)                                   |

## Decision Log

- 2026-07-23: ADR 0023 — opt-in separate from account; UTC windows; tokens only;
  unique ordinal ranks; me surface for settings; on-read v1; name-only avatars OK.
- 2026-07-23: Prefer new `leaderboard` feature slice; opt-in stays on users.
- 2026-07-23: Public `userId` = existing UUID for v1 (opaque id deferred).
- 2026-07-23: Invalid Bearer on public list → anonymous (omit viewer), not 401.

## Verification

Per slice, and full gate before complete:

```bash
npm run prisma:generate   # after schema
npm run verify:prisma     # after migrations
npm run openapi:generate  # after HTTP/DTO changes
npm run openapi:check
npm run openapi:lint
npm run verify            # format, lint, typecheck, deps, unit, openapi
npm run test:e2e -- --testPathPatterns='leaderboard|auth-me'
```

WSL/Windows: use `bash tools/agent/npmw ...` when applicable.

## Runtime Evidence

- Environment: local e2e harness (Postgres + Redis)
- Flows: opt-in → push usage → public list; opt-out → list; anonymous list; invalid Bearer still 200
- `npm run verify` — pass (351 unit tests)
- `npm run test:e2e -- --testPathPatterns='leaderboard|auth-me'` — 28 passed
- `npm run openapi:lint` — pass

## Risks And Mitigations

| Risk                | Mitigation                                      |
| ------------------- | ----------------------------------------------- |
| Privacy leak        | Explicit DTO allowlist; e2e asserts no email    |
| Abuse of public GET | IP rate limit 60/min; limit max 100; top-5 caps |
| Soft-auth mistakes  | Soft verify in controller; e2e invalid token    |
| Avatar private      | v1 `avatarUrl: null`                            |

## Completion Notes

Shipped public leaderboard v1:

| Method    | Path              | Notes               |
| --------- | ----------------- | ------------------- |
| GET       | `/v1/leaderboard` | `leaderboard.list`  |
| GET/PATCH | `/v1/me`          | `leaderboard.optIn` |

Key paths: `libs/features/leaderboard/**`, users me surface, migration
`20260723120000_leaderboard_opt_in`.

## Follow-Ups (post-v1)

- [ ] Public avatar URL strategy for opted-in users
- [ ] Opaque `publicUserId` if product wants non-UUID ids
- [ ] Materialized ranks / job cadence under load
- [ ] Accurate `toolsOmitted` / `modelsOmitted` (SQL top-N only → often 0)
- [ ] `metric=cost` / `metric=streak` (new ADR)
- [ ] burnly-web page + settings toggle (other repo)

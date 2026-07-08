# Usage Sync Phase D.1 — Idempotency, Limits, and Rate Limit

Date: 2026-07-09  
Owner: burnly-api  
Status: active  
Risk class: high  
Related issue/PR: N/A

## Objective

Make `POST /v1/sync/daily-usage` safe for desktop retries and abuse:

1. **Require** `Idempotency-Key` and prove replay is deterministic.
2. Enforce published payload limits with `SYNC_PAYLOAD_TOO_LARGE`.
3. Add a lightweight per-user **rate limit** on push.
4. Confirm logging hygiene on the collect path (no tokens/full payloads).

Proposal: `docs/planning/usage-sync-phase-d-hardening-proposal.md`  
Parent: `docs/planning/desktop-collect-implementation-plan.md` (Phase D)  
Contract: `docs/planning/desktop-collect-api-requirements.md`  
Depends on: Phase C complete (`POST /v1/sync/daily-usage` exists)

**Sibling plan (privacy):** implement either before or after this one:  
`docs/exec-plans/active/2026-07-09_usage-sync-05-account-deletion-wipe.md`  
(Prefer **05 first** if privacy is the priority.)

## Constraints

- Architecture constraints:
  - Reuse platform Redis idempotency (`@Idempotent`); do not invent a second store
  - Reuse Redis rate-limiter pattern from auth/profile features
  - Feature errors typed (`SyncErrorCode | ErrorCode`); no raw string codes
  - OpenAPI snapshot must stay in sync (`operationId`, `x-error-codes`, header required)
- Product/runtime constraints:
  - No production desktop clients yet → breaking “optional → required” key is OK if documented
  - Soft fact/model caps already exist (1000 / 100); promote to stable feature code
- Out of scope:
  - Account-deletion wipe (exec 05)
  - Web read APIs
  - Desktop client
  - Changing revision conflict policy
  - Per-device rate limit (v1: user only)

## Impact Areas

- API/OpenAPI: **yes** (required header, error codes)
- DB/Prisma/migrations: no
- Auth/session: no
- Queue/jobs: no
- Env/config/secrets: maybe (rate-limit constants; prefer code constants unless env needed)
- Observability/logging/tracing: yes (hygiene pass)
- External integrations: Redis (idempotency + rate limit)
- CI/release/harness: yes (e2e needs Redis)

## Decisions (defaults from proposal)

| ID | Decision | Choice |
| --- | --- | --- |
| D1 | Idempotency-Key | **Required** on push |
| D2 | Idempotency TTL | Platform default (**24h**) |
| D3 | Max body size | **1 MiB** if easy with Fastify; else document existing limit |
| D4 | Over fact/model limit | **`SYNC_PAYLOAD_TOO_LARGE`**, HTTP **400** |
| D5 | Rate limit | **60 requests / 15 minutes / user** on push only |
| D6 | Per-device rate limit | **No** (v1) |

## Implementation Checklist

### Idempotency

- [ ] Set `@Idempotent({ required: true, scopeKey: 'sync.dailyUsage.push' })` on push handler
- [ ] `@ApiIdempotencyKeyHeader({ required: true })` (or equivalent OpenAPI truth)
- [ ] Include `IDEMPOTENCY_IN_PROGRESS`, `CONFLICT`, `VALIDATION_FAILED` in `@ApiErrorCodes`
- [ ] Confirm missing key maps to a stable problem code (document exact code in OpenAPI)
- [ ] E2E: first push with key succeeds; second identical key replays same body/status; no double fact growth when revision unchanged / counts sensible
- [ ] E2E: request without key → 4xx (not silent accept)

### Payload limits

- [ ] Centralize constants (e.g. `MAX_FACTS_PER_BATCH = 1000`, `MAX_MODELS_PER_FACT = 100`) shared by DTO + service if possible
- [ ] On exceed: throw `UsageSyncError` with `SyncErrorCode.SYNC_PAYLOAD_TOO_LARGE` (status 400)
- [ ] Wire code through error filter (already feature-wide)
- [ ] Optional: enforce/document Fastify body limit ~1 MiB; map to problem if feasible
- [ ] Unit or e2e: 1001 facts → `SYNC_PAYLOAD_TOO_LARGE`
- [ ] Unit: 101 models on one fact → same

### Rate limiting

- [ ] Add Redis rate limiter (mirror `RedisProfileImageUploadRateLimiter` / auth limiters)
- [ ] Key: user id (+ optional fixed window); **60 / 15 min**
- [ ] Call from controller or service **after** auth, **before** heavy validation if cheap (or after device resolve—document choice)
- [ ] On exceed: `429` + `RATE_LIMITED` + `Retry-After` when platform supports it
- [ ] OpenAPI: add `RATE_LIMITED` to push `x-error-codes`
- [ ] Test: unit with mock Redis clock / forced exceed, or e2e with injected low limit

### Logging hygiene

- [ ] Review push controller/service for accidental body/token logs
- [ ] Prefer structured fields: `userId`, `clientDeviceId`, `clientRevision`, `factCount`, `traceId`, counts
- [ ] Do not log full fact payloads or Authorization headers

### Docs / contract

- [ ] `npm run openapi:generate` + `openapi:check`
- [ ] Brief note in requirements or engineering doc: key required; limits table; rate limit
- [ ] Update parent plan Phase D checkboxes when both 04+05 done

## Acceptance Criteria

1. Push without `Idempotency-Key` is rejected with a stable problem response.
2. Replay of the same key returns the original success payload (platform semantics).
3. Over-limit facts/models return `SYNC_PAYLOAD_TOO_LARGE` and write nothing.
4. Burst beyond rate limit returns `429` / `RATE_LIMITED`.
5. OpenAPI marks Idempotency-Key required and lists the new/changed error codes.
6. `npm run typecheck`, `deps:check`, targeted unit/e2e, `openapi:check` pass.

## Decision Log

- 2026-07-09: Split Phase D into 04 (API hardening) and 05 (deletion wipe) per AGENTS/exec-plan risk classes.
- Defaults D1–D6 from hardening proposal pending explicit product override.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run deps:check
npm run openapi:generate
npm run openapi:check
# Redis + Postgres required:
npm run test:e2e -- --testPathPatterns=usage-sync
```

## Runtime Evidence

- Environment: local API, Postgres, Redis
- Flow: register → PUT device → POST daily-usage (with key) twice
- Evidence: second response matches first; DB fact count stable for same revision

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Required key is a breaking change | No prod clients; document OpenAPI |
| Rate limit too aggressive | Start 60/15m; make constant easy to tune |
| Idempotency store misses Redis in test | e2e harness already uses Redis for auth |
| Double counting with SyncBatch audit on replay | Platform short-circuits handler on replay |

## Completion Notes

_(fill when done)_

## Follow-Ups

- [ ] Exec 05 account-deletion wipe (if not already done)
- [ ] Phase E full `npm run verify`
- [ ] Phase F desktop integration note (required headers + limits)

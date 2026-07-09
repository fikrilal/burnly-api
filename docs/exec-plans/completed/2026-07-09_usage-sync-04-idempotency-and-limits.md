# Usage Sync Phase D.1 — Idempotency, Limits, and Rate Limit

Date: 2026-07-09  
Owner: burnly-api  
Status: completed  
Risk class: high

## Objective

Required Idempotency-Key, SYNC_PAYLOAD_TOO_LARGE limits, and per-user push rate limit.

## Acceptance Criteria

1. Missing Idempotency-Key → 400 VALIDATION_FAILED
2. Replay same key → original success + Idempotency-Replayed
3. Over-limit facts → SYNC_PAYLOAD_TOO_LARGE, no write
4. Rate limit unit-tested (60/15m)
5. OpenAPI updated
6. typecheck / deps / e2e pass

## Implementation Checklist

- [x] `@Idempotent({ required: true })` + API header required
- [x] `SYNC_PAYLOAD_TOO_LARGE` for facts/models limits
- [x] `RedisDailyUsagePushRateLimiter` (60 / 15 min)
- [x] Retry-After on UsageSyncError
- [x] `docs/engineering/usage-sync/collect-limits.md`
- [x] E2E: missing key, replay, payload too large

## Verification Evidence

- typecheck, deps:check, openapi:check — pass
- unit: rate limiter — pass
- e2e usage-sync-daily-usage — **9/9 pass**

## Follow-Ups

- Phase E: full `npm run verify`
- Phase F: desktop handoff note (link collect-limits.md)

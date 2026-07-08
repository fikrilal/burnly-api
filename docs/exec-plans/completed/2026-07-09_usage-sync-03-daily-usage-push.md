# Usage Sync Phase C.2 — Daily Usage Push API

Date: 2026-07-09  
Owner: burnly-api  
Status: completed  
Risk class: high

## Objective

Implement `POST /v1/sync/daily-usage` with validation, all-or-nothing commits, and
stable problem codes.

## Acceptance Criteria

1. Canonical fixture accepted for a registered device.
2. Response counts match outcomes.
3. Invalid identity fails batch with 400; no partial write.
4. Missing device → `SYNC_DEVICE_NOT_FOUND`.
5. Unauthenticated → 401.
6. Empty facts heartbeat updates `lastSyncAt`.
7. OpenAPI + typecheck + deps + e2e pass.

## Implementation Checklist

- [x] Identity/cost/window validators + unit tests
- [x] `PushDailyUsageService` with `Clock`
- [x] Transactional `commitDailyUsagePush` (facts + device + batch audit)
- [x] Controller `POST /v1/sync/daily-usage` + optional Idempotency-Key
- [x] OpenAPI generate/check
- [x] E2E suite (6 cases)

## Verification Evidence

- `npm run typecheck` — pass
- unit: daily-identity, daily-usage-validation, sync-devices — pass
- `npm run deps:check` — pass
- `npm run openapi:generate` / `openapi:check` — pass
- `npm run test:e2e -- --testPathPatterns=usage-sync-daily-usage` — 6/6 pass

## Follow-Ups

- Phase D: mandatory idempotency policy, payload limits, account-deletion wipe

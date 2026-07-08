# Usage Sync Phase D.2 — Account Deletion Wipe

Date: 2026-07-09  
Owner: burnly-api  
Status: completed  
Risk class: high

## Objective

Hard-delete all usage-sync data for a user when account finalization runs.

## Acceptance Criteria

1. Finalize → 0 rows on SyncDevice, DailyUsageFact, DailyModelUsageFact, SyncBatch for that userId.
2. Finalize remains idempotent for already-deleted users.
3. Wipe only on actual finalize path.
4. Account-deletion engineering doc updated.
5. Tests + typecheck + deps:check pass.

## Implementation Checklist

- [x] `wipeUsageSyncForUser` helper (models → facts → batches → devices)
- [x] Call from `runFinalizeAccountDeletionTx`
- [x] Worker logs wipe counts
- [x] Unit test for delete order
- [x] queue-smoke int: seed usage-sync + assert zero residuals
- [x] Update `docs/engineering/users/account-deletion.md`

## Verification Evidence

- `npm run typecheck` — pass
- `npm test -- --testPathPatterns=wipe-usage-sync` — pass
- `npm run deps:check` — pass
- `npm run test:int -- --testPathPatterns=queue-smoke` — 6/6 pass (log shows usageSyncWipe counts)

## Follow-Ups

- Exec 04: idempotency + limits + rate limit

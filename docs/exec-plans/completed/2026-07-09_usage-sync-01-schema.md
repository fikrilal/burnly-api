# Usage Sync Phase B — Persistence Schema

Date: 2026-07-09  
Owner: burnly-api  
Status: completed  
Risk class: medium  
Related: `docs/planning/usage-sync-phase-b-schema-proposal.md` (approved)

## Objective

Add Postgres models and thin repositories for desktop collect storage without HTTP.

## Acceptance Criteria

1. Migration applies cleanly.
2. Uniques match ADR 0021 (`user+device+identityKey`, device client id, model identity).
3. No forbidden privacy columns.
4. `userId` denormalized for account wipe path.
5. Unit + integration tests green (int when DATABASE_URL present).

## Implementation Checklist

- [x] Prisma enums + models + User relations
- [x] Migration `usage_sync_collect`
- [x] `libs/features/usage-sync` ports + Prisma repos + module
- [x] `modelIdentityKey` helper + unit tests
- [x] Integration tests for upsert/cascade
- [x] Typecheck / unit tests / prisma status

## Verification Evidence

- `npx prisma migrate status` — up to date
- `npm run typecheck`
- `npm test` (includes model-identity unit tests)
- `npm run test:int -- test/usage-sync-persistence.int-spec.ts` when DB available

## Follow-ups

- Phase C: device + daily-usage HTTP use cases

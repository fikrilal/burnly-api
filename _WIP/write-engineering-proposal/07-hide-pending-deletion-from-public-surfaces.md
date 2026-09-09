# Engineering Proposal: Hide pending-deletion accounts from public surfaces

## Status

Draft — web product request handoff.

**Date:** 2026-08-07
**Requested by:** Burnly Web (user-facing behavior change)
**Affects:** `libs/features/leaderboard`, `libs/features/users` (public profile)
**Does not authorize implementation** until accepted.

## Summary / recommendation

When a user requests account deletion (`POST /v1/me/account-deletion/request`),
remove them from **public surfaces immediately** — the public leaderboard and the
public profile (`GET /v1/users/by-username/:username`) — while keeping the
account **fully usable privately** until the 30-day finalization job runs.

Current behavior: the account stays on public surfaces for the entire 30-day
grace period, because public queries only filter on `status`.

**Recommended change:**

| Surface                         | Current filter        | Proposed filter                                           |
| ------------------------------- | --------------------- | --------------------------------------------------------- |
| Leaderboard (all queries)       | `u.status = 'ACTIVE'` | `u.status = 'ACTIVE' AND u."deletionRequestedAt" IS NULL` |
| Public profile `findByUsername` | `status != 'DELETED'` | `status != 'DELETED' AND deletionRequestedAt IS NULL`     |

Private surfaces (`GET /v1/me`, login, refresh, dashboard/reports reads) are
**unchanged**: a pending-deletion account can still sign in and use the product
until finalization. The account remains cancellable via
`POST /v1/me/account-deletion/cancel`, which clears `deletionRequestedAt` and
restores public visibility.

## Context and problem

### Why this matters

Account deletion in Burnly is a **two-phase** flow (see
`docs/engineering/users/account-deletion.md`):

1. **Grace period (30 days)** — the account stays usable and can be canceled.
2. **Finalization** — the account is de-identified (PII erased) and becomes
   non-loginable.

The current implementation keeps the user **publicly visible for the entire
grace period**, because:

- `prisma-leaderboard.repository.ts` filters every query with
  `u.status = 'ACTIVE'` — a pending-deletion user is still `ACTIVE`, so they
  stay ranked.
- `prisma-users.repository.ts:findByUsername` filters
  `status: { not: DELETED }` — a pending-deletion user is not yet `DELETED`,
  so their public profile stays reachable.

Product expectation (Burnly Web): the moment a user requests deletion, they
should **no longer appear publicly** (leaderboard + public profile), even
though they can keep using their account privately until the grace period ends.

### Desired outcome

- Public leaderboard excludes users with a pending deletion.
- Public profile lookup returns 404 for users with a pending deletion.
- Private access is unchanged: the user can still log in, view their own data,
  and cancel the deletion during the grace period.
- Canceling a deletion restores public visibility immediately.

## Goals

- **One semantic change**: "has `deletionRequestedAt` set" ⇒ "not publicly
  visible", independent of `status`.
- Keep the change **small and query-local** (no schema migration, no new state
  field — `deletionRequestedAt` already exists).
- Preserve the existing finalization job and audit trail unchanged.
- Add e2e coverage for: pending-deletion user absent from leaderboard,
  pending-deletion public profile returns 404, cancel restores both.

## Non-goals

- No change to login/refresh/private `GET /v1/me` behavior.
- No change to the 30-day finalization schedule or PII erasure.
- No new user status enum value (`DELETION_PENDING` was considered; not needed
  since `deletionRequestedAt IS NOT NULL` is the exact predicate and adding a
  status would require a migration + audit churn).
- No change to the web UI (that is a separate Burnly Web change).

## Implementation sketch

### Leaderboard repository (`libs/features/leaderboard/infra/persistence/prisma-leaderboard.repository.ts`)

Every query that currently has `u.status = 'ACTIVE'::"UserStatus"` gains:

```sql
AND u."deletionRequestedAt" IS NULL
```

Locations (verified by grep): lines ~84, ~115, ~144, ~301.

Add the same predicate to any `count`/rank helper the leaderboard uses.

### Public profile repository (`libs/features/users/infra/persistence/prisma-users.repository.ts`)

`findByUsername` (line ~159):

```ts
where: {
  status: { not: PrismaUserStatus.DELETED },
  deletionRequestedAt: null,          // NEW
  profile: { username: { equals: username, mode: 'insensitive' } },
},
```

This makes `GET /v1/users/by-username/:username` return 404 for
pending-deletion users (the controller already maps "not found" to 404).

Check `toUserRecord` / public-profile DTO mapping: no change needed, the row is
simply not returned.

### Cancel path (no change)

`POST /v1/me/account-deletion/cancel` clears `deletionRequestedAt` (verified in
`prisma-users.repository.ts` cancel path), so public visibility returns
automatically — no extra work.

## Verification plan

- Unit: leaderboard repository queries exclude `deletionRequestedAt` users.
- E2E (extend `test/auth/auth-account-deletion.e2e-spec.ts`):
  1. Opt-in user requests deletion → leaderboard no longer contains them.
  2. Same user's `GET /v1/users/by-username/:username` → 404.
  3. `POST /v1/me/account-deletion/cancel` → leaderboard + public profile
     restored.
- Confirm private flows still work during the grace period (login + `GET
/v1/me` in the existing deletion e2e suite).
- OpenAPI: no contract change (response shapes unchanged); optionally note the
  behavior in the endpoint description.

## Open questions

1. Should a pending-deletion user's **own** leaderboard `viewer` block still
   show their rank? (Recommendation: no — the viewer block comes from the same
   filtered queries, so they'd see `opted_out`/`no_activity`; confirm this is
   acceptable UX.)
2. Should the web UI hide/disable the leaderboard opt-in toggle once deletion
   is requested? (Separate Burnly Web change; not required for this backend
   proposal.)

## Recommendation

**Accept.** The change is small, query-local, and matches the product
expectation that requesting deletion means leaving public surfaces immediately.
No schema change; `deletionRequestedAt` is the exact predicate.

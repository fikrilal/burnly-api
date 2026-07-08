# Engineering Proposal: Usage Sync Phase D — Hardening

## Status

**Approved for sequencing** (defaults D1–D8 as proposed). Exec plans written;
implementation not started until an exec is picked up.

Date: 2026-07-09  
Branch: `development`  
Parent plan: `docs/planning/desktop-collect-implementation-plan.md` (Phase D)  
Exec plans:

- `docs/exec-plans/active/2026-07-09_usage-sync-04-idempotency-and-limits.md`
- `docs/exec-plans/active/2026-07-09_usage-sync-05-account-deletion-wipe.md`

Binding ADRs:

- `docs/adr/0020-daily-usage-cloud-projection.md`
- `docs/adr/0021-usage-sync-identity-and-devices.md`

Contract: `docs/planning/desktop-collect-api-requirements.md`  
Depends on: Phase C complete (device + daily-usage APIs)

This document defines **how we make collect production-safe**: retries,
payload limits, rate limits, account-deletion wipe, and logging hygiene.

## Goal

After Phase D, burnly-api collect is safe for real desktop clients:

1. **Safe retries** of `POST /v1/sync/daily-usage` via idempotency.
2. **Bounded payloads** with stable problem codes.
3. **Account deletion leaves zero usage/sync residual** for that `userId`.
4. **Abuse-resistant** push rate limits (lightweight v1).
5. **PII-minimized logs** on the collect path.

## Non-goals (Phase D)

| Out of scope | Why |
| --- | --- |
| Web read/report APIs (`GET /v1/usage/*`) | Separate plan |
| Desktop client exporter / Settings UI | Desktop repo |
| Cloud retention policy (e.g. 2 years) | Later ADR |
| Full resync / `scope: "full"` tombstone sweeps | Deferred by ADR 0021 |
| Changing auth token model | Already stable |
| Mandatory Google-only login | Product later |

## Current state (as of Phase C)

| Area | Today | Gap |
| --- | --- | --- |
| Idempotency | `@Idempotent` on push, **optional** key | Desktop needs reliable replay; may want **required** key |
| Batch limits | DTO soft caps: 1000 facts, 100 models | Not published as `SYNC_PAYLOAD_TOO_LARGE`; no body-size mapping |
| Account deletion | Soft-delete user; scrub PII; drop sessions/credentials | **Does not wipe** `SyncDevice` / facts / batches (User row remains → no cascade) |
| Rate limit | None on sync routes | Auth/profile have Redis limiters; sync has none |
| Logging | Platform request logs | Ensure no tokens/payload dumps; device id OK |

**Critical privacy note:** account finalization keeps the `User` row (`status=DELETED`, scrubbed email). Because the row is not hard-deleted, **Postgres `ON DELETE CASCADE` never runs**. Usage data must be **explicitly deleted by `userId`**.

## Recommended Phase D scope cut

Split into **two exec plans** (matches parent plan):

| Exec | Focus | Risk |
| --- | --- | --- |
| **D1 / 04** | Idempotency policy + payload limits + rate limit + logging | medium |
| **D2 / 05** | Account-deletion wipe of all usage-sync tables | high (lifecycle) |

Optional: merge into one PR if small, but keep checklists separate for review.

---

## Workstream 1 — Idempotency (push)

### Proposal

| Decision | Choice |
| --- | --- |
| Header | `Idempotency-Key` (existing platform Redis store) |
| Scope | `sync.dailyUsage.push` (already set) |
| Required? | **Yes for v1 production collect** (`@Idempotent({ required: true, scopeKey: 'sync.dailyUsage.push' })`) |
| TTL | Keep platform default (24h) unless product wants longer |
| Concurrent same key | `IDEMPOTENCY_IN_PROGRESS` / wait (platform behavior) |

### Why required

Desktop will retry on network/`5xx` with the **same key**. Optional key means a client bug can double-apply under race (revision policy softens this, but response counts and batch audit still duplicate). Required key + platform replay gives deterministic HTTP semantics.

### Desktop contract (document in OpenAPI)

- Clients **must** send a new UUID per logical batch.
- Retries of the same batch reuse the same key.
- New batch (higher `clientRevision` or new window) → new key.

### Tests

- E2E: same key + same body → second response equals first; one net DB effect for facts (revision may show unchanged).
- E2E: missing key → `400 VALIDATION_FAILED` or platform’s missing-key behavior (verify and document exact code).
- E2E: in-progress concurrent key → `IDEMPOTENCY_IN_PROGRESS` or wait success.

### Open decisions

| # | Topic | Proposal |
| --- | --- | --- |
| D1 | Require Idempotency-Key | **Yes** |
| D2 | Idempotency TTL | 24h default |

---

## Workstream 2 — Payload limits

### Proposal (publish + enforce)

| Limit | Value | Enforcement |
| --- | --- | --- |
| Max facts per request | **1000** | Already `ArrayMaxSize(1000)` + service check |
| Max models per fact | **100** | Already service check |
| Max body size | **1 MiB** (or 2 MiB) | Fastify / Nest body limit if not global; map to problem |

### Error codes

| Condition | Code | HTTP |
| --- | --- | --- |
| Facts/models over max | Prefer **`SYNC_PAYLOAD_TOO_LARGE`** (already in enum) over generic validation | 413 or 400 |
| Body over size | `SYNC_PAYLOAD_TOO_LARGE` | 413 |

**Proposal:** use **413** for size/limit exceeded where Fastify signals it; use **400 + `SYNC_PAYLOAD_TOO_LARGE`** if easier with validation pipeline. Pick one and document in OpenAPI.

Recommendation: **400 + `SYNC_PAYLOAD_TOO_LARGE`** for app-level fact/model limits (consistent with validation path); **413** only if raw body parser rejects.

### Tests

- Unit/e2e: 1001 facts → `SYNC_PAYLOAD_TOO_LARGE` (or documented code).
- Unit: 101 models on one fact → same.

### Open decisions

| # | Topic | Proposal |
| --- | --- | --- |
| D3 | Body size | **1 MiB** |
| D4 | Limit error status | **400 + SYNC_PAYLOAD_TOO_LARGE** for fact/model limits |

---

## Workstream 3 — Rate limiting

### Proposal

Lightweight Redis limiter, same style as auth resend / profile upload:

| Dimension | Limit (proposal) |
| --- | --- |
| Per user | e.g. **60 pushes / 15 minutes** |
| Per device (optional) | e.g. **30 / 15 minutes** |

On exceed: `429` + `RATE_LIMITED` + `Retry-After` when available.

Apply only to `POST /v1/sync/daily-usage` (not device PUT/GET unless abused later).

### Why

Prevents runaway desktop loops / compromised tokens from flooding upserts.

### Open decisions

| # | Topic | Proposal |
| --- | --- | --- |
| D5 | Rate limit | **60 / 15 min per user** on push only |
| D6 | Per-device limit | Skip in v1 (user limit enough) |

---

## Workstream 4 — Account deletion wipe (**must ship**)

### Problem

`runFinalizeAccountDeletionTx` finalizes the user but **does not** delete:

- `DailyModelUsageFact`
- `DailyUsageFact`
- `SyncBatch`
- `SyncDevice`

User row remains → cascades never fire → **usage history would outlive account**.

That violates ADR 0020 (“account deletion must wipe usage data”) and product privacy.

### Proposal

In the **same finalization transaction** (after scrubbing PII / before or after session deletes—order below):

```text
1. (existing) load user, due checks
2. DELETE DailyModelUsageFact WHERE userId = ?
3. DELETE DailyUsageFact WHERE userId = ?
4. DELETE SyncBatch WHERE userId = ?
5. DELETE SyncDevice WHERE userId = ?
6. (existing) scrub user, delete credentials, sessions, tokens, profile names
7. (existing) audit FINALIZED
```

Order rationale:

- Delete children before devices (models → facts → batches → devices) to avoid FK surprises.
- Explicit `userId` filters match denormalized columns from Phase B.

Alternatively delete devices with cascade to facts if FK allows; **still** need explicit deletes because user is soft-deleted.

### Ownership

| Option | Choice |
| --- | --- |
| A. Inline deletes in `users-account-deletion.handlers.ts` | Simple, one place |
| B. Call `usage-sync` port from worker | Cleaner layering but worker currently imports Prisma handlers |

**Recommendation: A for v1** (mirror how credentials/sessions are deleted today), with a short comment linking ADR 0020. Optionally extract `wipeUsageSyncForUser(tx, userId)` helper in usage-sync **infra** or shared worker util to avoid bloating the handler—without introducing circular feature deps.

**Avoid:** features/users importing features/usage-sync app (boundary risk). Prefer:

- worker handler calls a pure Prisma wipe function colocated with deletion handler, **or**
- small function under `libs/features/usage-sync/infra/persistence/wipe-usage-sync-for-user.ts` imported only from **worker** (worker may orchestrate features).

### Tests

- Int/e2e or worker unit: seed user + device + fact + batch → run finalize → assert zero counts for that `userId` on all four tables; user status `DELETED`.
- Idempotent finalize: second run still skipped/clean.

### Docs

- Update `docs/engineering/users/account-deletion.md` “Finalization behavior” list to include usage-sync wipe.

### Open decisions

| # | Topic | Proposal |
| --- | --- | --- |
| D7 | Wipe location | Helper + call from finalize txn |
| D8 | Soft vs hard delete of facts | **Hard delete** on account finalize (no residual) |

---

## Workstream 5 — Logging hygiene

### Proposal

- Rely on platform redaction; do **not** log access/refresh tokens, full fact payloads, or raw request bodies.
- Structured fields allowed: `userId`, `clientDeviceId`, `clientRevision`, `factCount`, `traceId`, outcome counts.
- On validation failure: log issue **codes/fields**, not PII-bearing free text if any.

Audit via existing `SyncBatch` row is enough for support; avoid duplicating payload in logs.

No new log framework—just review push path for accidental verbose dumps.

---

## Suggested implementation order

```text
D2 wipe (privacy first)
  → D1 idempotency required + e2e replay
    → limits (SYNC_PAYLOAD_TOO_LARGE)
      → rate limit
        → logging pass + docs
          → openapi:generate / verify
```

Privacy wipe can ship independently of idempotency if needed for urgency.

## Exec plan sketches (after approval)

### `usage-sync-04-idempotency-and-limits`

- Make Idempotency-Key required on push
- E2E replay + missing key
- Fact/model limit → `SYNC_PAYLOAD_TOO_LARGE`
- Optional body size
- Redis rate limiter for push
- OpenAPI updates

### `usage-sync-05-account-deletion-wipe`

- Wipe helper + finalize handler integration
- Tests for residual-free finalize
- Update account-deletion engineering doc

## Success criteria (Phase D complete)

- [ ] Replay same Idempotency-Key is safe and deterministic
- [ ] Missing key rejected (if required policy accepted)
- [ ] Over-limit batches return stable feature code
- [ ] Finalize account deletion → 0 rows in sync tables for that user
- [ ] Rate limit returns 429 under burst (test with low limit in test env or unit mock)
- [ ] OpenAPI documents required header + error codes
- [ ] Account deletion doc updated
- [ ] `npm run typecheck` / targeted e2e / `openapi:check` green

## Risks

| Risk | Mitigation |
| --- | --- |
| Required idempotency breaks old clients | No production clients yet; document in OpenAPI |
| Wipe misses a table | Checklist + assert counts in test |
| Finalize txn too long | Deletes are indexed by userId; still keep in one txn for atomicity |
| Rate limit false positives for power users | Start lenient (60/15m); tune later |
| Double batch audit on non-idempotent path | Required key + platform cache |

## Relation to Phase E / F

| Phase | After D |
| --- | --- |
| **E** | Mostly already done; run full `npm run verify`, add any missing e2e |
| **F** | Integration note for desktop: endpoints, required headers, limits, fixture |

Web read APIs remain **out of collect hardening**.

## Open decisions summary (please confirm)

| # | Decision | Proposal |
| --- | --- | --- |
| D1 | Idempotency-Key required on push | **Yes** |
| D2 | Idempotency TTL | **24h** (platform default) |
| D3 | Max body size | **1 MiB** |
| D4 | Over-limit error | **`SYNC_PAYLOAD_TOO_LARGE`** (400) |
| D5 | Rate limit | **60 / 15 min per user** on push |
| D6 | Per-device rate limit | **No** (v1) |
| D7 | Wipe implementation site | **Finalize txn + helper** |
| D8 | Usage data on delete | **Hard delete** |

## Summary for reviewers

Phase D is not new product surface—it hardens what Phase C already shipped:

- **Retries that don’t corrupt state**
- **Bounded, rate-limited uploads**
- **True account deletion privacy for usage metrics**

Highest priority: **account-deletion wipe**. Second: **required idempotency + limits**.

**Please reply with:** approve as-is, or overrides on D1–D8. No implementation until that review.

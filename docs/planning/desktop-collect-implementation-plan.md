# Desktop Collect — High-Level Implementation Plan

## Status

Planning document for `burnly-api`.

Date: 2026-07-09  
Status: approved for sequencing (not an active exec plan)

This is the **end-to-end implementation roadmap** for the desktop **collect /
upload** path: sign in, register a device, push daily usage aggregates.

It is intentionally high level. When a phase is ready to build, split it into
one or more execution plans under `docs/exec-plans/active/` using
`docs/exec-plans/_template.md`.

## Document map

| Document                                            | Role                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `docs/planning/desktop-collect-api-requirements.md` | **Contract source of truth** for collect request/response field names, errors, acceptance |
| `docs/planning/cloud-sync-backend-handoff.md`       | Background: desktop schema meaning, privacy exclusions, multi-device storage sketch       |
| **This document**                                   | High-level backend implementation sequence for collect v1                                 |
| `docs/exec-plans/active/*`                          | Later: concrete PR-sized work units                                                       |

If this plan and the handoff disagree on **collect endpoint field names**, the
**requirements doc wins**. If they disagree on **privacy defaults** (what may
never leave the device), the handoff privacy table wins until product changes
it.

## Goal

Ship burnly-api so a signed-in desktop install can:

1. Authenticate with the **existing** auth stack (password and/or OIDC).
2. Register/update itself as a **sync device**.
3. **Push** batches of local **daily usage facts** (+ model breakdowns).
4. Rely on **idempotent**, validated writes suitable for retries.
5. Have synced usage **removed** when the user deletes their account.

After this plan is complete, desktop can integrate against a stable collect
contract. Web report/read APIs are a **follow-on** plan.

## Product framing (account is the cloud choice)

Local tracking stays fully useful with **no account and no network**.

Cloud usage is not a separate “opt-in sync toggle” product:

1. User wants full history / reports on the web.
2. User creates a Burnly account (or signs in).
3. Desktop signs in and can push daily aggregates for web reports.

**v1 push eligibility (desktop policy, not a second server flag):**

- User is signed in (valid session tokens).
- Network available (best effort).
- Local refresh has durable daily facts for the export window.

Do **not** require a server-side `syncEnabled` product flag for v1. Desktop may
still keep local UX state (e.g. last sync time); that is not a separate consent
layer beyond account.

## Non-goals

Out of scope for this implementation plan:

- Web read/report APIs (`GET /v1/usage/*`, calendar, leaderboard).
- Desktop client implementation (Settings UI, secure token store, SQLite exporter).
- Session usage upload, project paths, path fingerprints.
- Server pull / webhooks / real-time streaming.
- Mirroring full local SQLite.
- Public profiles or social features.
- Squashing historical Prisma migrations (optional cleanup, not collect).
- Replacing or redesigning the existing auth token model.

## End-to-end sequence (happy path)

```text
Desktop                          burnly-api
   |                                  |
   |  POST /v1/auth/* (login/OIDC)    |
   |--------------------------------->|
   |  access + refresh tokens         |
   |<---------------------------------|
   |                                  |
   |  PUT /v1/sync/devices/{id}       |
   |--------------------------------->|
   |  device metadata                 |
   |<---------------------------------|
   |                                  |
   |  (local collectors + reconcile)  |
   |                                  |
   |  POST /v1/sync/daily-usage       |
   |  Idempotency-Key: <batch>        |
   |--------------------------------->|
   |  counts + acceptedAt             |
   |<---------------------------------|
```

Offline / local-only:

```text
local refresh still works
no account => no push
signed-in but offline => queue/retry later with same Idempotency-Key
```

## Architecture placement

Follow existing modular-monolith rules (`docs/core/project-architecture.md`):

Suggested feature slice (name can be finalized in ADR):

```text
libs/features/usage-sync/   # or sync/
  domain/                   # pure validation helpers if useful
  app/                      # use cases + ports
  infra/
    http/                   # controllers, DTOs
    persistence/            # Prisma repos
```

Rules:

- `domain` / `app` must not import Nest/Prisma/HTTP.
- Controllers stay thin; validation + upsert logic live in app services.
- Reuse platform: `AccessTokenGuard`, idempotency middleware, problem details,
  OpenAPI decorators, `Clock` (no ad-hoc `new Date()` in app services).
- Wire the module from `apps/api` only (worker only if account-deletion job
  extension needs it).

## Contract surface (collect v1)

### Already exists (reuse)

| Method                                                       | Path                         |
| ------------------------------------------------------------ | ---------------------------- |
| `POST`                                                       | `/v1/auth/password/register` |
| `POST`                                                       | `/v1/auth/password/login`    |
| `POST`                                                       | `/v1/auth/oidc/exchange`     |
| `POST`                                                       | `/v1/auth/refresh`           |
| `POST`                                                       | `/v1/auth/logout`            |
| `GET`                                                        | `/v1/me`                     |
| Account deletion endpoints under `/v1/me/account-deletion/*` | as already shipped           |

Desktop **must** send a stable install `deviceId` / `deviceName` on auth so
sessions bind to the machine (see requirements).

### New endpoints

| Method | Path                                | Priority                              |
| ------ | ----------------------------------- | ------------------------------------- |
| `PUT`  | `/v1/sync/devices/{clientDeviceId}` | Required                              |
| `POST` | `/v1/sync/daily-usage`              | Required                              |
| `GET`  | `/v1/sync/devices/{clientDeviceId}` | Optional but useful; include if cheap |

Full DTO rules, cost pairing, identity reconstruction, batch limits, and error
handling: **`desktop-collect-api-requirements.md`**.

### Suggested problem codes

| Code                        | When                                        |
| --------------------------- | ------------------------------------------- |
| `SYNC_CONTRACT_UNSUPPORTED` | unsupported `contractVersion`               |
| `SYNC_DEVICE_NOT_FOUND`     | push references unknown device for user     |
| `SYNC_DEVICE_MISMATCH`      | device not owned by caller (should be rare) |
| `SYNC_PAYLOAD_TOO_LARGE`    | over batch / body limits                    |
| `SYNC_IDENTITY_INVALID`     | `identityKey` ≠ reconstructed key           |
| `SYNC_REVISION_STALE`       | optional; only if we reject lower revision  |

Reuse global codes for auth, validation envelope, and idempotency
(`UNAUTHORIZED`, `VALIDATION_FAILED`, `IDEMPOTENCY_IN_PROGRESS`, etc.).

## Data model sketch (backend-owned final form)

Handoff sketch; Prisma is finalized in the persistence phase / ADR.

```text
User
 └── SyncDevice          UNIQUE (user_id, client_device_id)
      └── DailyUsageFact UNIQUE (user_id, device_id, identity_key)
           └── DailyModelUsageFact  (replace-on-parent-upsert)
SyncBatch                audit + batch diagnostics (recommended)
```

**Identity key (daily):**

```text
{sourceKey}:daily:v{identityVersion}:{aggregationTimezone}:{usageDate}
```

Server **reconstructs** and rejects mismatches.

**Multi-device (v1):**

- Facts are namespaced by device.
- User-level web totals (later) **sum** across devices; do not merge streams as
  if two machines were one collector.

**Rolling window:**

- Batches use `window.scope = "full"` (first baseline generation; may be split) or
  `"incremental"` (later refreshes). Deprecated: `"rolling"`.
- Server must **not** delete facts merely absent from a request (no scope-based
  tombstone sweeps).
- Soft-remove only when a fact arrives with `recordState = removed` (or
  equivalent tombstone rule documented in ADR).

**Privacy (never store):**

- Project paths / fingerprints
- Source session ids / session rows (v1)
- Prompts, responses, code, files
- Collector raw payloads
- Credentials
- Local SQLite integer PKs as cloud identities

## High-level phases

Phases are sequential for the critical path. Within a phase, work can be split
into multiple exec plans / PRs when implementation starts.

### Phase A — Decisions and contract freeze

**Outcome:** Written decisions so implementers do not invent privacy or identity
rules mid-PR.

**Work:**

- ADR: opt-in-via-account daily usage **projection** (not full DB mirror).
- ADR section or second ADR: identity key format, device uniqueness,
  multi-device sum policy, rolling-window semantics.
- Record product framing: account = cloud choice; no `syncEnabled` server flag.
- List stable feature error codes in shared error-code enums (design only or
  skeleton).
- Confirm recommended defaults still open in handoff if needed:
  - rolling window length for clients (suggest 90 days; server stores history)
  - tokens-first; cost stored when valid, web display later
  - experimental sources accepted as opaque `sourceKey` strings

**Exit criteria:**

- [x] ADR(s) accepted and linked from this plan
- [x] Collect field names deferred to requirements doc (no competing DTO sketch)
- [x] Explicit non-goals listed for implementers

**Exec plan:** `docs/exec-plans/completed/2026-07-09_usage-sync-00-adr-and-codes.md`  
**ADRs:** `docs/adr/0020-daily-usage-cloud-projection.md`, `docs/adr/0021-usage-sync-identity-and-devices.md`

---

### Phase B — Persistence

**Outcome:** Postgres schema can store devices, daily facts, model children, and
batch audit rows with correct uniqueness.

**Engineering proposal (review before implement):**  
`docs/planning/usage-sync-phase-b-schema-proposal.md`

**Work:**

- Prisma models + migration
- Indexes for write path and future reads (user+date, device+date, etc.)
- Repository ports + Prisma adapters (no HTTP yet if preferred, or thin stubs)
- Map token/cost null semantics carefully (`NULL` ≠ `0`)

**Exit criteria:**

- [x] `prisma migrate` clean on empty DB
- [x] Unique constraints match upsert strategy
- [x] No storage of forbidden privacy fields

**Exec plan:** `docs/exec-plans/completed/2026-07-09_usage-sync-01-schema.md`  
**Proposal:** `docs/planning/usage-sync-phase-b-schema-proposal.md`

---

### Phase C — Collect write path (HTTP + use cases)

**Outcome:** Desktop-facing collect APIs work against real persistence.

**Work:**

- `PUT /v1/sync/devices/{clientDeviceId}` upsert
- `GET /v1/sync/devices/{clientDeviceId}` (if in scope for this cut)
- `POST /v1/sync/daily-usage`:
  - authenticate user
  - resolve device (404 → `SYNC_DEVICE_NOT_FOUND` if missing)
  - validate contract version, window, facts, cost pairing, identity key
  - all-or-nothing batch validation (v1)
  - upsert parents; replace model children per parent
  - apply `removed` soft state
  - conflict policy: same device, higher `clientRevision` then newer
    `lastSeenAt` wins
- DTOs + OpenAPI decorators
- Feature module wiring in API app

**Exit criteria:**

- [x] Requirements happy-path sequence works with HTTP client/fixtures
- [x] Invalid identity/cost → `400`, no partial write
- [x] Unknown/expired token → `401`, no write

**Exec plans:**

- [x] `docs/exec-plans/completed/2026-07-09_usage-sync-02-device-api.md` — PUT/GET devices
- [x] `docs/exec-plans/completed/2026-07-09_usage-sync-03-daily-usage-push.md` — POST daily-usage

Phase C collect write path is complete. Next: Phase D hardening.

---

### Phase D — Hardening

**Outcome:** Retries and account lifecycle are production-safe for collect.

**Engineering proposal (review before implement):**  
`docs/planning/usage-sync-phase-d-hardening-proposal.md`

**Work:**

- HTTP `Idempotency-Key` on `POST /v1/sync/daily-usage` (platform middleware)
- Replay returns original success payload
- Batch size / body limits → stable problem codes
- Rate limiting strategy (reuse platform patterns or feature-specific if needed)
- Extend account-deletion workflow to wipe:
  - model facts
  - daily facts
  - sync batches
  - devices
- Logging: no tokens; minimize PII; include `traceId` / device id where useful

**Exit criteria:**

- [x] Same `Idempotency-Key` replay is safe and deterministic
- [x] Account deletion leaves no residual usage metrics for the user
- [x] Limits documented for desktop (facts/batch, models/fact, body size)

**Exec plans:**

- [x] `docs/exec-plans/completed/2026-07-09_usage-sync-04-idempotency-and-limits.md` — idempotency, limits, rate limit
- [x] `docs/exec-plans/completed/2026-07-09_usage-sync-05-account-deletion-wipe.md` — finalize wipe

Phase D complete. Next: Phase E verify / Phase F handoff.

---

### Phase E — Contract gates and verification

**Outcome:** CI and clients can trust the collect contract.

**Work:**

- OpenAPI generate + Spectral / `openapi:check`
- Unit tests for identity reconstruction and cost invariants
- Integration/e2e tests using the **canonical fixture** from the requirements doc
- Auth negative paths (401/403)
- Device missing then re-register path
- Update engineering notes if useful (`docs/engineering/…`) lightly

**Exit criteria (mirror requirements acceptance):**

- [ ] Desktop can sign in with existing auth + `deviceId`
- [ ] Device PUT upserts metadata
- [ ] Daily-usage POST accepts canonical fixture idempotently
- [ ] Invalid payloads return field errors without write
- [ ] OpenAPI snapshot committed and lint-clean
- [ ] `npm run verify` green for the change set

**Later exec-plan shape:** `YYYY-MM-DD_usage-sync-06-openapi-and-e2e.md`

---

### Phase F — Client handoff (backend complete for collect)

**Outcome:** Desktop/web teams have a clear “ready to integrate” boundary.

**Work:**

- Short integration note (can live under `docs/engineering/` or planning):
  base URL, auth header, collect endpoints, fixture, known limits
- Mark this plan status complete / superseded by shipped ADRs + OpenAPI
- Explicitly defer:
  - web read APIs → separate high-level plan
  - desktop exporter + Settings → burnly desktop repo plans

**Exit criteria:**

- [ ] Collect OpenAPI is the integration contract
- [ ] No open P0 collect blockers for desktop to start client work
- [ ] Follow-on plans linked (web reads, desktop client)

## Dependencies and ordering

```text
Phase A (ADR/codes)
    -> Phase B (schema)
        -> Phase C (write APIs)
            -> Phase D (idempotency + deletion wipe)
                -> Phase E (OpenAPI + tests)
                    -> Phase F (handoff)
```

Do not start desktop client integration assumptions on frozen field names until
Phase E OpenAPI is published, unless desktop accepts working against the
requirements doc as a draft.

## Testing strategy (high level)

| Layer       | What                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| Unit        | Identity key rebuild, cost pairing, token null rules, revision compare |
| Integration | Prisma upsert uniqueness, child replace, soft remove                   |
| E2E HTTP    | Auth + device PUT + daily POST fixture; idempotent replay; 401/400     |
| Deletion    | User with facts → deletion job → zero residual rows                    |

Prefer fixtures from `desktop-collect-api-requirements.md` as golden payloads.

## Observability and ops

- Structured logs with `traceId`; never log access/refresh tokens or raw
  payloads with secrets.
- Metrics candidates (later, not blockers): push success/failure, batch size,
  validation reject rate.
- Support: `sync_batches` + device `last_sync_at` / app version.

## Risks

| Risk                                           | Mitigation                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| DTO drift between docs and OpenAPI             | Requirements win until OpenAPI ships; then OpenAPI is client contract |
| Partial batch complexity                       | All-or-nothing validation in v1                                       |
| Multi-device double count confusion            | Document sum-across-devices; namespace by device in storage           |
| Split full / partial refresh treated as delete | Never delete absent facts; only `recordState: removed`                |
| Account deletion misses tables                 | Explicit wipe checklist + test in Phase D                             |
| Overbuilding web reads early                   | Keep read APIs out of this plan                                       |

## Open questions (non-blocking defaults)

Use defaults unless product overrides before Phase A ADR:

1. **Rolling window (client):** 90 days.
2. **Cloud retention:** keep history until a retention policy exists; hard
   requirement is account-deletion wipe.
3. **Experimental sources:** accept unknown `sourceKey` strings; do not crash.
4. **Cost:** store when valid; web may show tokens-only first.
5. **GET device:** include in Phase C if low cost; otherwise defer to a small
   follow-up exec plan.

## How to break into exec plans later

When ready to implement a phase:

1. Copy `docs/exec-plans/_template.md` → `docs/exec-plans/active/`.
2. Name with sequence prefix, e.g. `2026-07-10_usage-sync-01-schema.md`.
3. Link back to **this plan** and to the requirements doc.
4. Keep each exec plan to one mergeable risk class (schema **or** HTTP **or**
   deletion, not everything).
5. Run the repo verify gates before calling a phase done.

Suggested first implementation cut when we start coding:

```text
1. ADR + error code skeletons          (Phase A)
2. Prisma schema + migration           (Phase B)
3. Device PUT/GET + daily-usage POST   (Phase C)
4. Idempotency + account wipe          (Phase D)
5. OpenAPI + e2e fixture               (Phase E)
```

## Success definition

This plan is **done** when:

1. A signed-in client can complete the requirements happy path against a local
   or deployed burnly-api.
2. Canonical fixture push is idempotent.
3. Invalid identity/cost payloads never write.
4. Account deletion removes all collect data for the user.
5. OpenAPI documents the collect endpoints.
6. Web read APIs and desktop UI remain explicitly future work.

## Summary

Build collect as a small, durable vertical slice:

**auth (exists) → devices → daily push → wipe on delete → OpenAPI/tests.**

Account creation/sign-in is how users choose cloud reports. Desktop remains
local-first. Cloud stores only daily aggregates suitable for later web history.

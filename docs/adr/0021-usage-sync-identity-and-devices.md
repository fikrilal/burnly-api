# 0021. Usage Sync Identity Keys, Devices, and Rolling Windows

- Status: Accepted
- Date: 2026-07-09
- Decision makers: Burnly API maintainers

## Context

Daily usage facts uploaded from Burnly desktop use **deterministic text
identities**, not local SQLite row ids. Users may run Burnly on more than one
machine. Desktop push uses a **rolling date window**, not a full-database
resync.

Backend upsert, multi-device reporting, and tombstone behavior must be locked
before Prisma/HTTP implementation.

Companion: ADR `0020-daily-usage-cloud-projection.md`.

## Decision

### 1) Daily identity key format

Desktop identity version `1` for daily parents:

```text
{sourceKey}:daily:v{identityVersion}:{aggregationTimezone}:{usageDate}
```

Example:

```text
claude-code:daily:v1:Asia/Jakarta:2026-07-08
```

Rules:

- `sourceKey` is a non-empty product source string (closed-but-versioned list on
  desktop; unknown keys must not crash ingest — store as opaque text).
- `identityVersion` is a positive integer (currently `1`).
- `aggregationTimezone` is a non-empty IANA timezone id.
- `usageDate` is `YYYY-MM-DD` (calendar date in that aggregation timezone).
- Server **reconstructs** the key from fact fields and rejects the batch fact
  (v1: fail whole batch) if `identityKey` does not match.

Session identity format exists on desktop but **is not accepted** on collect v1
APIs.

Identity version bumps are a **new scheme**: do not silently merge mixed
versions as if they were the same logical series without an explicit migration
story.

### 2) Cloud uniqueness and ownership

Logical ownership:

```text
User
 └── SyncDevice          unique (user_id, client_device_id)
      └── DailyUsageFact unique (user_id, device_id, identity_key)
           └── DailyModelUsageFact (children of one daily parent)
```

- `client_device_id` is generated and owned by the desktop install; stable across
  ordinary app updates; reinstall may create a new id (acceptable historical
  split).
- Server ids are UUIDs (or equivalent); local SQLite integers are never sync ids.
- Model children are **not** independently authoritative. On parent upsert,
  replace the child set for that parent (scoped replace).
- Parent `totalTokens` is authoritative for period totals. Model rows must never
  be summed to replace parent totals in future read APIs.

### 3) Multi-device policy (v1)

| Option | Decision |
| --- | --- |
| Storage | Separate streams per device |
| User-level reports (future web) | **Sum** active facts across the user's devices for the selected date/timezone window |
| Cross-device “union” / dedupe of the same source+date | **Not** in v1 — two machines can both have real usage on the same calendar day |
| Cross-device overwrite of the same identity | **Impossible** — `device_id` is part of uniqueness |

Conflict policy **within one device**:

- Higher `clientRevision` wins; if equal, newer client `lastSeenAt` wins
  (“last writer from same device”).

Optional: reject strictly lower revisions with `SYNC_REVISION_STALE` only if
implementation chooses hard reject; soft “ignore older” is also acceptable if
documented in OpenAPI. Prefer **ignore older / no-op success** for simpler
clients unless product requires an error.

### 4) Rolling window and tombstones

Collect v1 batches declare:

```json
"window": { "scope": "rolling", "startDate": "…", "endDate": "…" }
```

Rules:

- Rolling push **must not** delete server history outside the window.
- Desktop should include active/missing facts in-window and recent `removed`
  facts so the server can soft-delete.
- `recordState = removed` marks the cloud fact removed (soft); it does not hard-
  delete by default (hard delete may occur on account deletion).
- `scope: "full"` server-side wipe of missing identities is **out of v1**; do not
  implement full-window tombstone sweeps until product asks.

Recommended client window length: **90 days** (client policy). Server keeps
history until a retention ADR exists; **account deletion must wipe all usage
facts, model rows, batches, and devices for the user**.

### 5) Contract version

Collect body includes `contractVersion` (start at `1`). Unsupported versions
return `SYNC_CONTRACT_UNSUPPORTED`. Breaking DTO changes require a new version
and dual-read only if needed.

### 6) Batch validation (v1)

- Prefer **all-or-nothing** validation for a daily-usage batch.
- Any invalid fact → `VALIDATION_FAILED` or feature code as appropriate; **no
  partial commit**.
- HTTP `Idempotency-Key` per logical batch; replay returns original success.

### 7) Suggested limits (publish in OpenAPI later)

| Limit | Default |
| --- | --- |
| Max facts per request | 1000 |
| Max models per fact | 100 |
| Max body size | 1–2 MiB |

Oversize → `SYNC_PAYLOAD_TOO_LARGE` or platform 413 mapping as implemented.

## Rationale

- Deterministic keys match desktop reconciliation and enable idempotent upsert.
- Device namespacing avoids false “same day same machine” merges and supports
  honest multi-machine totals.
- Rolling windows match how desktop export will work without dangerous full
  resync semantics.
- Reconstructing `identityKey` prevents clients from forging inconsistent
  identity fields.

## Consequences

Positive:

- Clear unique constraints for Phase B.
- Safe retries and multi-device reporting story for Phase 2 web reads.
- Privacy-preserving identity (no session ids / paths).

Negative / costs:

- Reinstall creates a new device stream (possible history split).
- Sum-across-devices can look “high” if the same human uses two machines; that
  is intended for “all my machines” totals.
- Implementers must carefully implement child replace and soft-remove.

## Alternatives Considered

1. **Global unique identityKey per user without device** — rejected (collides
   multi-device real usage; encourages wrong merge).
2. **Cross-device dedupe by source+date** — rejected for v1 (loses real work).
3. **Full resync deletes missing in window** — deferred (dangerous with rolling
   partial exports).
4. **Use local SQLite ids** — rejected (not stable across machines/reinstalls).

## Links / References

- Related ADRs: `0020-daily-usage-cloud-projection.md`
- Related docs:
  - `docs/planning/desktop-collect-api-requirements.md`
  - `docs/planning/cloud-sync-backend-handoff.md`
  - `docs/planning/desktop-collect-implementation-plan.md`

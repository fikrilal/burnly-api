# Engineering Proposal: `GET /v1/sync/status`

## Status

Draft — Phase 2 web read path.  
**Date:** 2026-07-16  
**Parent:** `docs/planning/cloud-sync-backend-handoff.md` (Phase 2; Sync status for Settings UI)  
**Depends on:** Phase 1 `SyncDevice` (+ optional batch audit already stored)  
**Does not authorize implementation** until accepted.

## Summary / recommendation

Add a lightweight authenticated endpoint that answers **“is cloud up to date?”** for Settings / dashboard chrome: list the user’s sync devices, last successful push times, app/platform/timezone metadata, and account-level `lastSyncAt`.

This is **not** a usage totals API.

## Context and problem

### Current behavior

- Devices registered via existing sync device APIs; fields live on `SyncDevice`:
  - `clientDeviceId`, `displayName`, `platform`, `appVersion`
  - `reportingTimezone`, `lastSyncAt`, `lastClientRevision`
  - indexes: `(userId)`, `(userId, lastSyncAt)`

- `SyncBatch` audit rows exist for support/diagnostics but are not required for v1 Settings.
- No dedicated “sync status” GET for web.

### Desired outcome

Web Settings shows connected installs and freshness without scanning usage facts.

## Goals

- List all `SyncDevice` rows for the principal.
- Account-level `lastSyncAt = MAX(device.lastSyncAt)`.
- Public device identity is **`clientDeviceId`** (matches collect API), not server UUID.

## Non-goals

| Out of scope                | Why                                                                      |
| --------------------------- | ------------------------------------------------------------------------ |
| Token usage numbers         | Summary / calendar                                                       |
| Full batch history listing  | Support tooling later                                                    |
| Triggering a desktop push   | Client-only                                                              |
| Auth session list           | `GET /v1/me/sessions` (different concept: login sessions ≠ sync devices) |
| Editing device display name | Optional later write endpoint                                            |

## Constraints and invariants

1. User-scoped only; cascade delete already ties devices to user.
2. Do not expose secrets, tokens, or internal-only diagnostics.
3. Omit server UUID `id` in v1 unless a future write/edit API needs it.
4. Tag as **`Sync`** to sit beside existing device/push controllers under `/v1/sync/*`.

## Proposed design

### Contract

```http
GET /v1/sync/status
Authorization: Bearer <accessToken>
```

No required query parameters in v1.

`operationId`: `sync.status.get`  
Tag: **`Sync`**

### Response (`200`)

```json
{
  "data": {
    "lastSyncAt": "2026-07-15T03:55:00.000Z",
    "deviceCount": 2,
    "devices": [
      {
        "clientDeviceId": "dev_abc",
        "displayName": "fikri-laptop",
        "platform": "linux",
        "appVersion": "0.1.20",
        "reportingTimezone": "Asia/Jakarta",
        "lastSyncAt": "2026-07-15T03:55:00.000Z",
        "lastClientRevision": 42,
        "createdAt": "2026-07-01T10:00:00.000Z",
        "updatedAt": "2026-07-15T03:55:00.000Z"
      },
      {
        "clientDeviceId": "dev_xyz",
        "displayName": "studio-mac",
        "platform": "macos",
        "appVersion": "0.1.18",
        "reportingTimezone": "America/Los_Angeles",
        "lastSyncAt": null,
        "lastClientRevision": null,
        "createdAt": "2026-07-10T08:00:00.000Z",
        "updatedAt": "2026-07-10T08:00:00.000Z"
      }
    ]
  }
}
```

| Field                | Meaning                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `lastSyncAt`         | Max of device `lastSyncAt`, or `null` if none ever synced                        |
| `devices[]`          | All devices for user; order: `lastSyncAt DESC NULLS LAST`, then `createdAt DESC` |
| `lastClientRevision` | Last accepted push revision on the device row                                    |

Empty inventory: `deviceCount: 0`, `devices: []`, `lastSyncAt: null`.

### Error codes

| Code           | When       |
| -------------- | ---------- |
| `UNAUTHORIZED` | Auth       |
| `INTERNAL`     | Unexpected |

### Data access

```sql
SELECT *
FROM sync_devices
WHERE user_id = $user
ORDER BY last_sync_at DESC NULLS LAST, created_at DESC;
```

Optional v1.1 enrichment from `sync_batches` (last accepted/rejected) — **skip for v1**.

Reuse existing `SyncDevicesRepository` list-by-user if present; otherwise add a thin method rather than a second repository style.

### Ownership and placement

```text
app/get-sync-status.service.ts
infra/http/sync-status.controller.ts   # beside sync-devices.controller
infra/http/dtos/sync-status.dto.ts
```

Controller patterns match `DailyUsageController` / devices: `AccessTokenGuard`, `ApiBearerAuth`, `ApiErrorCodes`, existing `UsageSyncErrorFilter` only if needed (likely not for this happy path).

### Runtime flow

```text
Controller -> GetSyncStatusService
  devices = devicesRepo.listByUser(userId)
  lastSyncAt = max(devices.lastSyncAt)
  map DTO (no server ids)
  return { data }
```

Safe to cache briefly on client; server remains source of truth after each push updates `lastSyncAt`.

## Alternatives considered

| Option                                        | Verdict                                     |
| --------------------------------------------- | ------------------------------------------- |
| Fold status into `GET /v1/usage/summary` only | Insufficient for multi-device Settings list |
| Return last N `SyncBatch` rows                | Support-only; defer                         |
| Expose server UUID                            | Defer until edit/delete device API needs it |

## Material risks

| Risk                                        | Mitigation                                                |
| ------------------------------------------- | --------------------------------------------------------- |
| Confusing sync devices with login sessions  | Naming + docs; separate paths                             |
| Stale `lastSyncAt` if push fails mid-flight | Only update on successful push (already Phase 1 behavior) |

## Acceptance criteria

- [ ] Authenticated user sees only their devices.
- [ ] After successful daily-usage push e2e, device `lastSyncAt` and account `lastSyncAt` reflect the push.
- [ ] Registered-but-never-pushed device appears with `lastSyncAt: null`.
- [ ] No server UUID required by response schema.
- [ ] OpenAPI + unit (ordering with nulls) + e2e.

## Open questions

| Topic                     | Recommended default      |
| ------------------------- | ------------------------ |
| Include last batch status | No in v1                 |
| Device rename/delete APIs | Separate later proposals |

## Effort

**Small** — simplest Phase 2 endpoint; good first or parallel PR with read foundation.

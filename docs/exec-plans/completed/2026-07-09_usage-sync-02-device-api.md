# Usage Sync Phase C.1 — Device Collect API

Date: 2026-07-09  
Owner: burnly-api  
Status: completed  
Risk class: medium  
Related issue/PR: N/A

## Objective

Expose authenticated HTTP APIs so a signed-in desktop install can **register and
read** its sync device metadata, using the Phase B `SyncDevice` persistence.

## Acceptance Criteria

1. Authenticated `PUT` creates a `SyncDevice` and returns envelope `data`.
2. Second `PUT` with same `clientDeviceId` updates metadata.
3. Authenticated `GET` returns the device after PUT, including `lastSyncAt`.
4. `GET` unknown device → 404 `SYNC_DEVICE_NOT_FOUND`.
5. Unauthenticated → 401 `UNAUTHORIZED`.
6. OpenAPI documents both operations under Sync tag.
7. `deps:check` passes.

## Implementation Checklist

- [x] Expand `UsageSyncModule` for HTTP + PlatformAuthModule
- [x] `SyncDevicesService` upsert/get
- [x] Controller PUT/GET `/v1/sync/devices/:clientDeviceId`
- [x] DTOs + error filter + SyncErrorCode mapping
- [x] Wire into `AppModule` + OpenAPI Sync tag
- [x] Unit tests for service
- [x] E2E: put/get/update, 404, 401, validation
- [x] `openapi:generate` + `openapi:check`

## Verification Evidence

- `npm run typecheck` — pass
- `npm test -- --testPathPatterns='sync-devices.service|model-identity'` — pass
- `npm run deps:check` — pass
- `npm run openapi:generate` / `openapi:check` — pass
- `npm run test:e2e -- --testPathPatterns=usage-sync-devices` — 4/4 pass

## Follow-Ups

- Exec plan 03: `POST /v1/sync/daily-usage`

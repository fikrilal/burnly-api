# Usage Sync Collect Limits

Desktop collect contract notes for `POST /v1/sync/daily-usage`.

## Required headers

| Header            | Required | Notes                                                                                                                          |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Authorization`   | yes      | `Bearer <accessToken>`                                                                                                         |
| `Idempotency-Key` | **yes**  | Opaque string (UUID recommended), max 128 chars. Reuse on retries of the same batch. Replays set `Idempotency-Replayed: true`. |

Missing `Idempotency-Key` → `400` `VALIDATION_FAILED` with field `Idempotency-Key`.

## Payload limits

| Limit             | Value | Error                          |
| ----------------- | ----- | ------------------------------ |
| Facts per request | 1000  | `SYNC_PAYLOAD_TOO_LARGE` (400) |
| Models per fact   | 100   | `SYNC_PAYLOAD_TOO_LARGE` (400) |

Constants: `libs/features/usage-sync/app/usage-sync.limits.ts`.

## Rate limit

| Dimension | Limit                                                 |
| --------- | ----------------------------------------------------- |
| Per user  | 60 push attempts / 15 minutes (then block 15 minutes) |

Exceed → `429` `RATE_LIMITED` with `Retry-After` when available.

Device PUT/GET are not rate-limited in v1.

## Related

- OpenAPI: `docs/openapi/openapi.yaml` (Sync tag)
- Requirements: `docs/planning/desktop-collect-api-requirements.md`

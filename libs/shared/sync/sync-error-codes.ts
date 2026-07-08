/**
 * Feature error codes for usage-sync collect APIs.
 * Stable API contract values — do not rename casually.
 *
 * @see docs/planning/desktop-collect-api-requirements.md
 * @see docs/adr/0020-daily-usage-cloud-projection.md
 * @see docs/adr/0021-usage-sync-identity-and-devices.md
 */
export enum SyncErrorCode {
  SYNC_CONTRACT_UNSUPPORTED = 'SYNC_CONTRACT_UNSUPPORTED',
  SYNC_DEVICE_NOT_FOUND = 'SYNC_DEVICE_NOT_FOUND',
  SYNC_DEVICE_MISMATCH = 'SYNC_DEVICE_MISMATCH',
  SYNC_PAYLOAD_TOO_LARGE = 'SYNC_PAYLOAD_TOO_LARGE',
  SYNC_IDENTITY_INVALID = 'SYNC_IDENTITY_INVALID',
  /** Optional hard reject for lower clientRevision; soft ignore is also allowed. */
  SYNC_REVISION_STALE = 'SYNC_REVISION_STALE',
}

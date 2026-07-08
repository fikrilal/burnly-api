/**
 * Stable identity for daily model breakdown uniqueness.
 * Postgres UNIQUE allows multiple NULLs; we never store null as the unique key.
 *
 * @see docs/adr/0021-usage-sync-identity-and-devices.md
 * @see docs/planning/usage-sync-phase-b-schema-proposal.md
 */
export const UNKNOWN_MODEL_IDENTITY_KEY = '__unknown__' as const;

export function toModelIdentityKey(rawModelId: string | null | undefined): string {
  if (rawModelId === null || rawModelId === undefined) {
    return UNKNOWN_MODEL_IDENTITY_KEY;
  }

  const trimmed = rawModelId.trim();
  if (trimmed.length === 0) {
    return UNKNOWN_MODEL_IDENTITY_KEY;
  }

  return trimmed;
}

export function rawModelIdFromIdentityKey(modelIdentityKey: string): string | null {
  if (modelIdentityKey === UNKNOWN_MODEL_IDENTITY_KEY) {
    return null;
  }
  return modelIdentityKey;
}

/**
 * Public display name for leaderboard rows (never email).
 */

export type NameParts = Readonly<{
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
}>;

function nonEmptyTrimmed(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fallback handle: `user_` + first 8 hex chars of UUID (no hyphens).
 */
export function publicHandleFromUserId(userId: string): string {
  const hex = userId.replace(/-/g, '').toLowerCase();
  const prefix = hex.slice(0, 8);
  return `user_${prefix.length > 0 ? prefix : 'unknown'}`;
}

export function resolvePublicDisplayName(parts: NameParts, userId: string): string {
  const display = nonEmptyTrimmed(parts.displayName);
  if (display) return display;

  const given = nonEmptyTrimmed(parts.givenName);
  const family = nonEmptyTrimmed(parts.familyName);
  if (given && family) return `${given} ${family}`;
  if (given) return given;
  if (family) return family;

  return publicHandleFromUserId(userId);
}

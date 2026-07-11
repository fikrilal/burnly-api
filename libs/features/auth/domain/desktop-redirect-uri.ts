/**
 * Exact-match allowlist for desktop OAuth-style redirect_uri values.
 */

export function parseDesktopRedirectUriAllowlist(raw: string | undefined): ReadonlyArray<string> {
  if (raw === undefined || raw.trim() === '') {
    return ['burnly://auth/callback'];
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isAllowedDesktopRedirectUri(
  redirectUri: string,
  allowlist: ReadonlyArray<string>,
): boolean {
  if (redirectUri.length === 0 || redirectUri.length > 2048) return false;
  return allowlist.includes(redirectUri);
}

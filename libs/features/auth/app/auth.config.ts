export type AuthConfig = Readonly<{
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  passwordMinLength: number;
  /** Comma-separated exact redirect_uri allowlist (see AUTH_DESKTOP_REDIRECT_URIS). */
  desktopRedirectUrisRaw?: string;
  /** Handoff code TTL seconds (default 60). */
  desktopHandoffTtlSeconds: number;
}>;

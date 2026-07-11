export type DesktopHandoffRateLimitContext = Readonly<{
  /** Client IP when known (exchange is public). */
  ip?: string;
  /** Authenticated user id when creating a handoff (Bearer path). */
  userId?: string;
}>;

export interface DesktopHandoffRateLimiter {
  /** Throws AuthError RATE_LIMITED when blocked. No-op when Redis is disabled. */
  assertAllowed(ctx: DesktopHandoffRateLimitContext): Promise<void>;
}

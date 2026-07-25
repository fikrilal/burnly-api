/**
 * Opaque keyset cursor for leaderboard pagination.
 * Payload: totalTokens (string bigint) + userId after stable sort.
 */

export type LeaderboardCursorPayload = Readonly<{
  totalTokens: string;
  userId: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function encodeLeaderboardCursor(payload: LeaderboardCursorPayload): string {
  const json = JSON.stringify({ t: payload.totalTokens, u: payload.userId });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeLeaderboardCursor(raw: string): LeaderboardCursorPayload | null {
  let json: string;
  try {
    json = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  const t = parsed.t;
  const u = parsed.u;
  if (typeof t !== 'string' || t.length === 0) return null;
  if (typeof u !== 'string' || u.length === 0) return null;
  // totalTokens must be non-negative integer string
  if (!/^\d+$/.test(t)) return null;
  return { totalTokens: t, userId: u };
}

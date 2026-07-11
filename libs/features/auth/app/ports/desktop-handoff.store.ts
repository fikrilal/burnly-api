export type DesktopHandoffRecord = Readonly<{
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  client: 'desktop';
  createdAtMs: number;
}>;

/**
 * Ephemeral one-time store for desktop handoff codes (hashed).
 * Implementations should enforce TTL and atomic consume.
 */
export interface DesktopHandoffStore {
  /**
   * Persist a new handoff. Returns false if the store is unavailable.
   */
  save(codeHash: string, record: DesktopHandoffRecord, ttlSeconds: number): Promise<boolean>;

  /**
   * Atomically load and delete. Returns null if missing/expired/unavailable.
   */
  consume(codeHash: string): Promise<DesktopHandoffRecord | null>;
}

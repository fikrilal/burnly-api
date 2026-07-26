import type { UpdateMePatch, UserRecord } from '../users.types';

export type RequestAccountDeletionResult =
  | Readonly<{ kind: 'ok'; user: UserRecord }>
  | Readonly<{ kind: 'already_requested'; user: UserRecord }>
  | Readonly<{ kind: 'not_found' }>;

export type CancelAccountDeletionResult =
  | Readonly<{ kind: 'ok'; user: UserRecord }>
  | Readonly<{ kind: 'not_requested'; user: UserRecord }>
  | Readonly<{ kind: 'not_found' }>;

export type PublicProfileStatsResult = Readonly<{
  totalTokens: bigint;
  topTools: ReadonlyArray<{ sourceKey: string; totalTokens: bigint }>;
  topModels: ReadonlyArray<{
    modelIdentityKey: string;
    displayName: string | null;
    totalTokens: bigint;
  }>;
  activityCalendar: ReadonlyArray<{ date: string; totalTokens: bigint }>;
}>;

export interface UsersRepository {
  findById(userId: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  getPublicProfileStats(userId: string): Promise<PublicProfileStatsResult>;
  updateMe(userId: string, patch: UpdateMePatch): Promise<UserRecord | null>;

  requestAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
    now: Date;
    scheduledFor: Date;
  }): Promise<RequestAccountDeletionResult>;

  cancelAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
    now: Date;
  }): Promise<CancelAccountDeletionResult>;
}

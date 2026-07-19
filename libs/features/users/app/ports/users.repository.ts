import type { UpdateMePatch, UserRecord } from '../users.types';

export type RequestAccountDeletionResult =
  | Readonly<{ kind: 'ok'; user: UserRecord }>
  | Readonly<{ kind: 'already_requested'; user: UserRecord }>
  | Readonly<{ kind: 'not_found' }>;

export type CancelAccountDeletionResult =
  | Readonly<{ kind: 'ok'; user: UserRecord }>
  | Readonly<{ kind: 'not_requested'; user: UserRecord }>
  | Readonly<{ kind: 'not_found' }>;

export interface UsersRepository {
  findById(userId: string): Promise<UserRecord | null>;
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

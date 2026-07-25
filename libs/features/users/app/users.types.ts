import type { AuthMethod } from '../../../shared/auth/auth-method';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type UserProfileRecord = Readonly<{
  profileImageFileId: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
}>;

export type LeaderboardSettingsRecord = Readonly<{
  optIn: boolean;
  optedInAt: Date | null;
}>;

export type LeaderboardSettingsView = Readonly<{
  optIn: boolean;
  optedInAt: string | null;
}>;

export type UpdateMeProfilePatch = Readonly<{
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}>;

export type UpdateMeLeaderboardPatch = Readonly<{
  optIn: boolean;
}>;

export type UpdateMePatch = Readonly<{
  profile?: UpdateMeProfilePatch;
  leaderboard?: UpdateMeLeaderboardPatch;
}>;

export type AccountDeletionView = Readonly<{
  requestedAt: string;
  scheduledFor: string;
}>;

export type UserRecord = Readonly<{
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  deletionRequestedAt: Date | null;
  deletionScheduledFor: Date | null;
  authMethods: ReadonlyArray<AuthMethod>;
  profile: UserProfileRecord | null;
  leaderboard: LeaderboardSettingsRecord;
}>;

export type MeView = Readonly<{
  id: string;
  email: string;
  emailVerified: boolean;
  roles: ReadonlyArray<string>;
  authMethods: ReadonlyArray<AuthMethod>;
  profile: UserProfileRecord;
  leaderboard: LeaderboardSettingsView;
  accountDeletion: AccountDeletionView | null;
}>;

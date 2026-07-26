import type { AuthMethod } from '../../../shared/auth/auth-method';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type UserProfileRecord = Readonly<{
  profileImageFileId: string | null;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  username: string | null;
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
  username?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}>;

export type PublicProfileToolItem = Readonly<{
  sourceKey: string;
  totalTokens: bigint;
}>;

export type PublicProfileModelItem = Readonly<{
  modelIdentityKey: string;
  displayName: string | null;
  totalTokens: bigint;
}>;

export type PublicProfileCalendarDay = Readonly<{
  date: string;
  totalTokens: bigint;
}>;

export type PublicProfileRecord = Readonly<{
  id: string;
  displayName: string | null;
  username: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  joinedAt: string;
  totalTokens: bigint;
  topTools: ReadonlyArray<PublicProfileToolItem>;
  topModels: ReadonlyArray<PublicProfileModelItem>;
  activityCalendar: ReadonlyArray<PublicProfileCalendarDay>;
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
  createdAt: Date;
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

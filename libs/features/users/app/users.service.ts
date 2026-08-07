import type { UsersRepository } from './ports/users.repository';
import type { AccountDeletionScheduler } from './ports/account-deletion.scheduler';
import { UserNotFoundError } from './users.errors';
import { CONSUMER_USER_ROLES } from '../../../shared/auth/user-roles';
import type {
  LeaderboardSettingsRecord,
  LeaderboardSettingsView,
  MeView,
  PublicProfileRecord,
  UpdateMePatch,
  UserProfileRecord,
  UserRecord,
} from './users.types';
import { addDays, type Clock } from './time';

const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 30;

const EMPTY_PROFILE: UserProfileRecord = {
  profileImageFileId: null,
  displayName: null,
  givenName: null,
  familyName: null,
  username: null,
  githubUrl: null,
  websiteUrl: null,
};

const DEFAULT_LEADERBOARD: LeaderboardSettingsRecord = {
  optIn: true,
  optedInAt: null,
};

export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly accountDeletion: AccountDeletionScheduler,
    private readonly clock: Clock,
  ) {}

  async getMe(userId: string): Promise<MeView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }
    this.assertUserNotDeleted(user);

    return this.toMeView(user);
  }

  async getPublicProfileByUsername(username: string): Promise<PublicProfileRecord> {
    const user = await this.users.findByUsername(username);
    if (!user || user.status === 'DELETED' || !user.leaderboard.optIn) {
      throw new UserNotFoundError();
    }

    const stats = await this.users.getPublicProfileStats(user.id);
    const profile = user.profile ?? EMPTY_PROFILE;

    return {
      id: user.id,
      displayName: profile.displayName,
      username: profile.username,
      githubUrl: profile.githubUrl,
      websiteUrl: profile.websiteUrl,
      joinedAt: user.createdAt.toISOString(),
      totalTokens: stats.totalTokens,
      topTools: stats.topTools,
      topModels: stats.topModels,
      activityCalendar: stats.activityCalendar,
    };
  }

  async updateMe(userId: string, patch: UpdateMePatch): Promise<MeView> {
    const user = await this.users.updateMe(userId, patch);
    if (!user) {
      throw new UserNotFoundError();
    }
    this.assertUserNotDeleted(user);

    return this.toMeView(user);
  }

  /** @deprecated Prefer updateMe; kept for call sites that only patch profile. */
  async updateMeProfile(
    userId: string,
    patch: NonNullable<UpdateMePatch['profile']>,
  ): Promise<MeView> {
    return this.updateMe(userId, { profile: patch });
  }

  async requestAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
  }): Promise<Readonly<{ scheduledFor: Date; newlyRequested: boolean }>> {
    const now = this.clock.now();
    const scheduledFor = addDays(now, ACCOUNT_DELETION_GRACE_PERIOD_DAYS);

    const res = await this.users.requestAccountDeletion({
      userId: input.userId,
      sessionId: input.sessionId,
      traceId: input.traceId,
      now,
      scheduledFor,
    });

    if (res.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    this.assertUserNotDeleted(res.user);

    const due = res.user.deletionScheduledFor ?? scheduledFor;
    await this.accountDeletion.scheduleFinalize(input.userId, due);

    return { scheduledFor: due, newlyRequested: res.kind === 'ok' };
  }

  async cancelAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
  }): Promise<void> {
    const now = this.clock.now();
    const res = await this.users.cancelAccountDeletion({
      userId: input.userId,
      sessionId: input.sessionId,
      traceId: input.traceId,
      now,
    });

    if (res.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    this.assertUserNotDeleted(res.user);

    await this.accountDeletion.cancelFinalize(input.userId);
  }

  private assertUserNotDeleted(user: UserRecord): void {
    if (user.status === 'DELETED') {
      throw new UserNotFoundError();
    }
  }

  private toLeaderboardView(leaderboard: LeaderboardSettingsRecord): LeaderboardSettingsView {
    return {
      optIn: leaderboard.optIn,
      optedInAt: leaderboard.optedInAt ? leaderboard.optedInAt.toISOString() : null,
    };
  }

  private toMeView(user: UserRecord): MeView {
    const profile: UserProfileRecord = user.profile ?? EMPTY_PROFILE;
    const leaderboard = user.leaderboard ?? DEFAULT_LEADERBOARD;

    const accountDeletion =
      user.deletionRequestedAt && user.deletionScheduledFor
        ? {
            requestedAt: user.deletionRequestedAt.toISOString(),
            scheduledFor: user.deletionScheduledFor.toISOString(),
          }
        : null;

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      roles: [...CONSUMER_USER_ROLES],
      authMethods: [...user.authMethods],
      profile,
      leaderboard: this.toLeaderboardView(leaderboard),
      accountDeletion,
    };
  }
}

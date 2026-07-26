import { Inject, Injectable } from '@nestjs/common';
import {
  ExternalIdentityProvider as PrismaExternalIdentityProvider,
  Prisma,
  UserStatus as PrismaUserStatus,
  type ExternalIdentity,
  type PasswordCredential,
  type User,
  type UserProfile,
} from '@prisma/client';
import type { PublicProfileStatsResult, UsersRepository } from '../../app/ports/users.repository';
import type {
  LeaderboardSettingsRecord,
  UpdateMePatch,
  UserProfileRecord,
  UserRecord,
  UserStatus,
} from '../../app/users.types';
import { PrismaService } from '../../../../platform/db/prisma.service';
import { withTransactionRetry } from '../../../../platform/db/tx-retry';
import type { AuthMethod } from '../../../../shared/auth/auth-method';
import type { Clock } from '../../app/time';
import { USERS_CLOCK } from '../users.tokens';

import { UsersError } from '../../app/users.errors';
import { UsersErrorCode } from '../../app/users.error-codes';

type PrismaUserWithProfile = Pick<
  User,
  | 'id'
  | 'email'
  | 'emailVerifiedAt'
  | 'status'
  | 'createdAt'
  | 'deletionRequestedAt'
  | 'deletionScheduledFor'
> & {
  profile: Pick<
    UserProfile,
    | 'profileImageFileId'
    | 'displayName'
    | 'givenName'
    | 'familyName'
    | 'username'
    | 'githubUrl'
    | 'websiteUrl'
    | 'leaderboardOptIn'
    | 'leaderboardOptedInAt'
  > | null;
  passwordCredential: Pick<PasswordCredential, 'userId'> | null;
  externalIdentities: Array<Pick<ExternalIdentity, 'provider'>>;
};

const USER_WITH_PROFILE_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  status: true,
  createdAt: true,
  deletionRequestedAt: true,
  deletionScheduledFor: true,
  profile: {
    select: {
      profileImageFileId: true,
      displayName: true,
      givenName: true,
      familyName: true,
      username: true,
      githubUrl: true,
      websiteUrl: true,
      leaderboardOptIn: true,
      leaderboardOptedInAt: true,
    },
  },
  passwordCredential: { select: { userId: true } },
  externalIdentities: { select: { provider: true } },
} as const satisfies Prisma.UserSelect;

function toProfileRecord(profile: PrismaUserWithProfile['profile']): UserProfileRecord | null {
  if (!profile) return null;
  return {
    profileImageFileId: profile.profileImageFileId,
    displayName: profile.displayName,
    givenName: profile.givenName,
    familyName: profile.familyName,
    username: profile.username,
    githubUrl: profile.githubUrl,
    websiteUrl: profile.websiteUrl,
  };
}

function toLeaderboardRecord(profile: PrismaUserWithProfile['profile']): LeaderboardSettingsRecord {
  if (!profile) {
    return { optIn: true, optedInAt: null };
  }
  return {
    optIn: profile.leaderboardOptIn,
    optedInAt: profile.leaderboardOptedInAt,
  };
}

function toAuthMethods(user: PrismaUserWithProfile): AuthMethod[] {
  const methods: AuthMethod[] = [];

  if (user.passwordCredential) methods.push('PASSWORD');

  const hasGoogle = user.externalIdentities.some(
    (i) => i.provider === PrismaExternalIdentityProvider.GOOGLE,
  );
  if (hasGoogle) methods.push('GOOGLE');

  return methods;
}

function toUserStatus(status: PrismaUserStatus): UserStatus {
  switch (status) {
    case PrismaUserStatus.ACTIVE:
      return 'ACTIVE';
    case PrismaUserStatus.SUSPENDED:
      return 'SUSPENDED';
    case PrismaUserStatus.DELETED:
      return 'DELETED';
  }
}

function toUserRecord(user: PrismaUserWithProfile): UserRecord {
  return {
    id: user.id,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    status: toUserStatus(user.status),
    createdAt: user.createdAt,
    deletionRequestedAt: user.deletionRequestedAt,
    deletionScheduledFor: user.deletionScheduledFor,
    authMethods: toAuthMethods(user),
    profile: toProfileRecord(user.profile),
    leaderboard: toLeaderboardRecord(user.profile),
  };
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USERS_CLOCK) private readonly clock: Clock,
  ) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: USER_WITH_PROFILE_SELECT,
    });
    if (!user) return null;
    if (user.status === PrismaUserStatus.DELETED) return null;
    return toUserRecord(user);
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const client = this.prisma.getClient();
    const user = await client.user.findFirst({
      where: {
        status: { not: PrismaUserStatus.DELETED },
        profile: { username: { equals: username, mode: 'insensitive' } },
      },
      select: USER_WITH_PROFILE_SELECT,
    });
    if (!user) return null;
    return toUserRecord(user);
  }

  async getPublicProfileStats(userId: string): Promise<PublicProfileStatsResult> {
    const client = this.prisma.getClient();

    const sumResult = await client.dailyUsageFact.aggregate({
      where: { userId, recordState: 'active' },
      _sum: { totalTokens: true },
    });
    const totalTokens = sumResult._sum.totalTokens ?? 0n;

    const toolRows = await client.$queryRaw<Array<{ source_key: string; total_tokens: bigint }>>`
      SELECT f."sourceKey" AS source_key, SUM(f."totalTokens") AS total_tokens
      FROM "DailyUsageFact" f
      WHERE f."userId" = ${userId}::uuid AND f."recordState" = 'active'::"UsageRecordState"
      GROUP BY f."sourceKey"
      ORDER BY total_tokens DESC, source_key ASC
      LIMIT 5
    `;

    const modelRows = await client.$queryRaw<
      Array<{ model_identity_key: string; display_name: string | null; total_tokens: bigint }>
    >`
      SELECT m."modelIdentityKey" AS model_identity_key, MAX(m."displayName") AS display_name, SUM(COALESCE(m."totalTokens", 0)) AS total_tokens
      FROM "DailyModelUsageFact" m
      INNER JOIN "DailyUsageFact" f ON f.id = m."dailyUsageFactId"
      WHERE m."userId" = ${userId}::uuid AND f."recordState" = 'active'::"UsageRecordState"
      GROUP BY m."modelIdentityKey"
      HAVING SUM(COALESCE(m."totalTokens", 0)) > 0
      ORDER BY total_tokens DESC, model_identity_key ASC
      LIMIT 5
    `;

    const calendarRows = await client.dailyUsageFact.groupBy({
      by: ['usageDate'],
      where: { userId, recordState: 'active' },
      _sum: { totalTokens: true },
      orderBy: { usageDate: 'asc' },
    });

    const activityCalendar = calendarRows.map((r) => {
      const year = r.usageDate.getUTCFullYear();
      const month = String(r.usageDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(r.usageDate.getUTCDate()).padStart(2, '0');
      return {
        date: `${year}-${month}-${day}`,
        totalTokens: r._sum.totalTokens ?? 0n,
      };
    });

    return {
      totalTokens,
      topTools: toolRows.map((r) => ({
        sourceKey: r.source_key,
        totalTokens: BigInt(r.total_tokens),
      })),
      topModels: modelRows.map((r) => ({
        modelIdentityKey: r.model_identity_key,
        displayName: r.display_name,
        totalTokens: BigInt(r.total_tokens),
      })),
      activityCalendar,
    };
  }

  async updateMe(userId: string, patch: UpdateMePatch): Promise<UserRecord | null> {
    const client = this.prisma.getClient();
    const now = this.clock.now();

    const profileData: {
      displayName?: string | null;
      givenName?: string | null;
      familyName?: string | null;
      username?: string | null;
      githubUrl?: string | null;
      websiteUrl?: string | null;
      leaderboardOptIn?: boolean;
      leaderboardOptedInAt?: Date | null;
    } = {};

    if (patch.profile) {
      if (patch.profile.displayName !== undefined) {
        profileData.displayName = patch.profile.displayName;
      }
      if (patch.profile.givenName !== undefined) {
        profileData.givenName = patch.profile.givenName;
      }
      if (patch.profile.familyName !== undefined) {
        profileData.familyName = patch.profile.familyName;
      }
      if (patch.profile.username !== undefined) {
        profileData.username = patch.profile.username;
      }
      if (patch.profile.githubUrl !== undefined) {
        profileData.githubUrl = patch.profile.githubUrl;
      }
      if (patch.profile.websiteUrl !== undefined) {
        profileData.websiteUrl = patch.profile.websiteUrl;
      }
    }

    if (patch.leaderboard) {
      profileData.leaderboardOptIn = patch.leaderboard.optIn;
      profileData.leaderboardOptedInAt = patch.leaderboard.optIn ? now : null;
    }

    try {
      return await client.$transaction(async (tx) => {
        const locked = await tx.user.updateMany({
          where: { id: userId, status: { not: PrismaUserStatus.DELETED } },
          data: { updatedAt: now },
        });
        if (locked.count === 0) return null;

        await tx.userProfile.upsert({
          where: { userId },
          create: { userId, ...profileData },
          update: profileData,
        });

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: USER_WITH_PROFILE_SELECT,
        });
        if (!user || user.status === PrismaUserStatus.DELETED) return null;

        return toUserRecord(user);
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const metaTarget = err.meta?.target;
        const targetContainsUsername = Array.isArray(metaTarget) && metaTarget.includes('username');
        const targetIsUsernameString =
          typeof metaTarget === 'string' && metaTarget.includes('username');
        const messageContainsUsername = err.message.includes('username');

        if (targetContainsUsername || targetIsUsernameString || messageContainsUsername) {
          throw new UsersError({
            status: 409,
            code: UsersErrorCode.USERNAME_TAKEN,
            message: 'Username is already taken',
          });
        }
      }
      throw err;
    }
  }

  async requestAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
    now: Date;
    scheduledFor: Date;
  }) {
    const client = this.prisma.getClient();

    return await withTransactionRetry(
      client,
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: USER_WITH_PROFILE_SELECT,
        });
        if (!user) return { kind: 'not_found' } as const;
        if (user.status === PrismaUserStatus.DELETED) return { kind: 'not_found' } as const;

        if (user.deletionScheduledFor !== null) {
          return { kind: 'already_requested', user: toUserRecord(user) } as const;
        }

        const updated = await tx.user.update({
          where: { id: input.userId },
          data: {
            deletionRequestedAt: input.now,
            deletionScheduledFor: input.scheduledFor,
            deletionRequestedSessionId: input.sessionId,
            deletionRequestedTraceId: input.traceId,
          },
          select: USER_WITH_PROFILE_SELECT,
        });

        await tx.userAccountDeletionAudit.create({
          data: {
            actorUserId: input.userId,
            actorSessionId: input.sessionId,
            targetUserId: input.userId,
            action: 'REQUESTED',
            traceId: input.traceId,
          },
          select: { id: true },
        });

        return { kind: 'ok', user: toUserRecord(updated) } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async cancelAccountDeletion(input: {
    userId: string;
    sessionId: string;
    traceId: string;
    now: Date;
  }) {
    const client = this.prisma.getClient();

    return await withTransactionRetry(
      client,
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: USER_WITH_PROFILE_SELECT,
        });
        if (!user) return { kind: 'not_found' } as const;
        if (user.status === PrismaUserStatus.DELETED) return { kind: 'not_found' } as const;

        if (user.deletionScheduledFor === null) {
          return { kind: 'not_requested', user: toUserRecord(user) } as const;
        }

        const updated = await tx.user.update({
          where: { id: input.userId },
          data: {
            deletionRequestedAt: null,
            deletionScheduledFor: null,
            deletionRequestedSessionId: null,
            deletionRequestedTraceId: null,
          },
          select: USER_WITH_PROFILE_SELECT,
        });

        await tx.userAccountDeletionAudit.create({
          data: {
            actorUserId: input.userId,
            actorSessionId: input.sessionId,
            targetUserId: input.userId,
            action: 'CANCELED',
            traceId: input.traceId,
          },
          select: { id: true },
        });

        return { kind: 'ok', user: toUserRecord(updated) } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

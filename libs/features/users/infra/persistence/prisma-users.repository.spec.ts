import type { Prisma } from '@prisma/client';
import { UserStatus as PrismaUserStatus } from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import type { Clock } from '../../app/time';
import { PrismaUsersRepository } from './prisma-users.repository';
import { createPrototypeStub } from '../../../../../test/support/stubs';

function createPrismaStub(params: {
  lockCount: number;
  userRow: Readonly<{
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    status: PrismaUserStatus;
    deletionRequestedAt: Date | null;
    deletionScheduledFor: Date | null;
    profile: Readonly<{
      profileImageFileId: string | null;
      displayName: string | null;
      givenName: string | null;
      familyName: string | null;
      githubUrl: string | null;
      websiteUrl: string | null;
      leaderboardOptIn: boolean;
      leaderboardOptedInAt: Date | null;
    }> | null;
    passwordCredential: Readonly<{ userId: string }> | null;
    externalIdentities: Array<Readonly<{ provider: string }>>;
  }> | null;
}): Readonly<{
  prisma: PrismaService;
  userUpdateManyCalls: Prisma.UserUpdateManyArgs[];
  profileUpsertCalls: Prisma.UserProfileUpsertArgs[];
  userFindUniqueCalls: Prisma.UserFindUniqueArgs[];
}> {
  const userUpdateManyCalls: Prisma.UserUpdateManyArgs[] = [];
  const profileUpsertCalls: Prisma.UserProfileUpsertArgs[] = [];
  const userFindUniqueCalls: Prisma.UserFindUniqueArgs[] = [];

  const txClient = {
    user: {
      updateMany: async (args: Prisma.UserUpdateManyArgs) => {
        userUpdateManyCalls.push(args);
        return { count: params.lockCount };
      },
      findUnique: async (args: Prisma.UserFindUniqueArgs) => {
        userFindUniqueCalls.push(args);
        return params.userRow;
      },
    },
    userProfile: {
      upsert: async (args: Prisma.UserProfileUpsertArgs) => {
        profileUpsertCalls.push(args);
        return { userId: 'user-1' };
      },
    },
  };

  const client = {
    $transaction: async <T>(
      fn: (tx: typeof txClient) => Promise<T>,
      _options?: unknown,
    ): Promise<T> => await fn(txClient),
  };

  const prisma = createPrototypeStub(PrismaService, { getClient: () => client });
  return { prisma, userUpdateManyCalls, profileUpsertCalls, userFindUniqueCalls };
}

describe('PrismaUsersRepository.updateMe (unit)', () => {
  it('returns null and does not upsert when the user is deleted (or missing)', async () => {
    const { prisma, userUpdateManyCalls, profileUpsertCalls, userFindUniqueCalls } =
      createPrismaStub({ lockCount: 0, userRow: null });
    const clock = { now: () => new Date('2026-01-01T00:00:00.000Z') } satisfies Clock;
    const repo = new PrismaUsersRepository(prisma, clock);

    const res = await repo.updateMe('user-1', { profile: { displayName: 'Dante' } });

    expect(res).toBeNull();
    expect(userUpdateManyCalls).toEqual([
      {
        where: { id: 'user-1', status: { not: PrismaUserStatus.DELETED } },
        data: { updatedAt: expect.any(Date) },
      },
    ]);
    expect(profileUpsertCalls).toHaveLength(0);
    expect(userFindUniqueCalls).toHaveLength(0);
  });

  it('upserts the profile only after locking a non-deleted user', async () => {
    const { prisma, userUpdateManyCalls, profileUpsertCalls, userFindUniqueCalls } =
      createPrismaStub({
        lockCount: 1,
        userRow: {
          id: 'user-1',
          email: 'user@example.com',
          emailVerifiedAt: null,
          status: PrismaUserStatus.ACTIVE,
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          profile: {
            profileImageFileId: null,
            displayName: 'Dante',
            givenName: null,
            familyName: null,
            githubUrl: null,
            websiteUrl: null,
            leaderboardOptIn: false,
            leaderboardOptedInAt: null,
          },
          passwordCredential: null,
          externalIdentities: [],
        },
      });
    const clock = { now: () => new Date('2026-01-01T00:00:00.000Z') } satisfies Clock;
    const repo = new PrismaUsersRepository(prisma, clock);

    const res = await repo.updateMe('user-1', { profile: { displayName: 'Dante' } });

    expect(userUpdateManyCalls).toHaveLength(1);
    expect(profileUpsertCalls).toEqual([
      {
        where: { userId: 'user-1' },
        create: { userId: 'user-1', displayName: 'Dante' },
        update: { displayName: 'Dante' },
      },
    ]);
    expect(userFindUniqueCalls).toHaveLength(1);
    expect(res).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      emailVerifiedAt: null,
      status: 'ACTIVE',
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      authMethods: [],
      profile: {
        profileImageFileId: null,
        displayName: 'Dante',
        givenName: null,
        familyName: null,
        githubUrl: null,
        websiteUrl: null,
      },
      leaderboard: { optIn: false, optedInAt: null },
    });
  });

  it('sets leaderboardOptIn and optedInAt when opting in', async () => {
    const now = new Date('2026-07-23T08:00:00.000Z');
    const { prisma, profileUpsertCalls } = createPrismaStub({
      lockCount: 1,
      userRow: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
        status: PrismaUserStatus.ACTIVE,
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        profile: {
          profileImageFileId: null,
          displayName: null,
          givenName: null,
          familyName: null,
          githubUrl: null,
          websiteUrl: null,
          leaderboardOptIn: true,
          leaderboardOptedInAt: now,
        },
        passwordCredential: null,
        externalIdentities: [],
      },
    });
    const clock = { now: () => now } satisfies Clock;
    const repo = new PrismaUsersRepository(prisma, clock);

    const res = await repo.updateMe('user-1', { leaderboard: { optIn: true } });

    expect(profileUpsertCalls).toEqual([
      {
        where: { userId: 'user-1' },
        create: {
          userId: 'user-1',
          leaderboardOptIn: true,
          leaderboardOptedInAt: now,
        },
        update: {
          leaderboardOptIn: true,
          leaderboardOptedInAt: now,
        },
      },
    ]);
    expect(res?.leaderboard).toEqual({ optIn: true, optedInAt: now });
  });
});

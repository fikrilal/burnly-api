import { UsersService } from './users.service';
import { UserNotFoundError } from './users.errors';
import type { AccountDeletionScheduler } from './ports/account-deletion.scheduler';
import type {
  CancelAccountDeletionResult,
  RequestAccountDeletionResult,
  UsersRepository,
} from './ports/users.repository';
import type { MeView, UpdateMePatch, UserRecord } from './users.types';
import type { Clock } from './time';

function unimplemented(): never {
  throw new Error('Not implemented');
}

function fixedClock(now: Date): Clock {
  return { now: () => new Date(now.getTime()) };
}

function makeUser(partial?: Partial<UserRecord>): UserRecord {
  return {
    id: 'user-1',
    email: 'user@example.com',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    authMethods: ['PASSWORD'],
    profile: null,
    leaderboard: { optIn: true, optedInAt: null },
    ...partial,
  };
}

function makeRepo(overrides: Partial<UsersRepository>): UsersRepository {
  return {
    findById: async () => unimplemented(),
    findByUsername: async () => unimplemented(),
    getPublicProfileStats: async () => unimplemented(),
    updateMe: async () => unimplemented(),
    requestAccountDeletion: async () => unimplemented(),
    cancelAccountDeletion: async () => unimplemented(),
    ...overrides,
  };
}

function makeScheduler(): {
  scheduler: AccountDeletionScheduler;
  scheduleCalls: Array<{ userId: string; scheduledFor: Date }>;
  cancelCalls: Array<{ userId: string }>;
} {
  const scheduleCalls: Array<{ userId: string; scheduledFor: Date }> = [];
  const cancelCalls: Array<{ userId: string }> = [];

  return {
    scheduleCalls,
    cancelCalls,
    scheduler: {
      scheduleFinalize: async (userId, scheduledFor) => {
        scheduleCalls.push({ userId, scheduledFor });
      },
      cancelFinalize: async (userId) => {
        cancelCalls.push({ userId });
      },
    },
  };
}

describe('UsersService', () => {
  const clock = fixedClock(new Date('2026-01-01T00:00:00.000Z'));

  it('getMe returns a MeView with a non-null profile and default leaderboard on', async () => {
    const repo = makeRepo({ findById: async () => makeUser({ profile: null }) });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler, clock);

    const res = await service.getMe('user-1');

    expect(res).toEqual<MeView>({
      id: 'user-1',
      email: 'user@example.com',
      emailVerified: true,
      roles: ['USER'],
      authMethods: ['PASSWORD'],
      profile: {
        profileImageFileId: null,
        displayName: null,
        givenName: null,
        familyName: null,
        username: null,
        githubUrl: null,
        websiteUrl: null,
      },
      leaderboard: { optIn: true, optedInAt: null },
      accountDeletion: null,
    });
  });

  it('getMe maps leaderboard opted-in timestamp', async () => {
    const optedInAt = new Date('2026-07-23T12:00:00.000Z');
    const repo = makeRepo({
      findById: async () =>
        makeUser({
          leaderboard: { optIn: true, optedInAt },
        }),
    });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler, clock);

    const res = await service.getMe('user-1');
    expect(res.leaderboard).toEqual({
      optIn: true,
      optedInAt: '2026-07-23T12:00:00.000Z',
    });
  });

  it('getMe throws UserNotFoundError when repo returns null', async () => {
    const repo = makeRepo({ findById: async () => null });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler, clock);

    await expect(service.getMe('missing')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('getMe throws UserNotFoundError when user is DELETED', async () => {
    const repo = makeRepo({ findById: async () => makeUser({ status: 'DELETED' }) });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler, clock);

    await expect(service.getMe('user-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('updateMe throws UserNotFoundError when repo returns null', async () => {
    const repo = makeRepo({
      updateMe: async () => null,
    });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler, clock);

    const patch: UpdateMePatch = { profile: { displayName: 'Alice' } };
    await expect(service.updateMe('missing', patch)).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('updateMe passes leaderboard patch through to the repository', async () => {
    let captured: UpdateMePatch | undefined;
    const repo = makeRepo({
      updateMe: async (_id, patch) => {
        captured = patch;
        return makeUser({
          leaderboard: { optIn: true, optedInAt: new Date('2026-01-01T00:00:00.000Z') },
        });
      },
    });
    const { scheduler } = makeScheduler();
    const service = new UsersService(repo, scheduler, clock);

    const res = await service.updateMe('user-1', { leaderboard: { optIn: true } });
    expect(captured).toEqual({ leaderboard: { optIn: true } });
    expect(res.leaderboard.optIn).toBe(true);
  });

  it('requestAccountDeletion passes deterministic now + scheduledFor to the repository and schedules the job', async () => {
    const expectedNow = new Date('2026-01-01T00:00:00.000Z');
    const expectedScheduledFor = new Date('2026-01-31T00:00:00.000Z');

    let capturedInput:
      | {
          userId: string;
          sessionId: string;
          traceId: string;
          now: Date;
          scheduledFor: Date;
        }
      | undefined;

    const repo = makeRepo({
      requestAccountDeletion: async (input) => {
        capturedInput = input;
        const user = makeUser({ deletionScheduledFor: null });
        const res: RequestAccountDeletionResult = { kind: 'ok', user };
        return res;
      },
    });

    const { scheduler, scheduleCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler, fixedClock(expectedNow));

    const res = await service.requestAccountDeletion({
      userId: 'user-1',
      sessionId: 'session-1',
      traceId: 'trace-1',
    });

    expect(capturedInput).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      traceId: 'trace-1',
      now: expectedNow,
      scheduledFor: expectedScheduledFor,
    });
    expect(scheduleCalls).toEqual([{ userId: 'user-1', scheduledFor: expectedScheduledFor }]);
    expect(res).toEqual({ scheduledFor: expectedScheduledFor, newlyRequested: true });
  });

  it('cancelAccountDeletion cancels the finalize job', async () => {
    const repo = makeRepo({
      cancelAccountDeletion: async () => {
        const res: CancelAccountDeletionResult = {
          kind: 'ok',
          user: makeUser({ deletionScheduledFor: null }),
        };
        return res;
      },
    });
    const { scheduler, cancelCalls } = makeScheduler();
    const service = new UsersService(repo, scheduler, clock);

    await service.cancelAccountDeletion({
      userId: 'user-1',
      sessionId: 'session-1',
      traceId: 'trace-1',
    });

    expect(cancelCalls).toEqual([{ userId: 'user-1' }]);
  });

  describe('getPublicProfileByUsername', () => {
    it('returns public profile for opted in user', async () => {
      const repo = makeRepo({
        findByUsername: async (username) => {
          if (username === 'dante') {
            return makeUser({
              id: 'user-1',
              profile: {
                profileImageFileId: null,
                displayName: 'Dante',
                givenName: 'Dante',
                familyName: 'Alighieri',
                username: 'dante',
                githubUrl: 'https://github.com/dante',
                websiteUrl: 'https://dante.example.com',
              },
              leaderboard: { optIn: true, optedInAt: new Date('2026-01-01T00:00:00.000Z') },
            });
          }
          return null;
        },
        getPublicProfileStats: async (userId) => {
          expect(userId).toBe('user-1');
          return {
            totalTokens: 1000000n,
            topTools: [{ sourceKey: 'claude-code', totalTokens: 1000000n }],
            topModels: [
              {
                modelIdentityKey: 'claude-sonnet',
                displayName: 'Claude Sonnet',
                totalTokens: 1000000n,
              },
            ],
            activityCalendar: [{ date: '2026-01-01', totalTokens: 1000000n }],
          };
        },
      });
      const { scheduler } = makeScheduler();
      const service = new UsersService(repo, scheduler, clock);

      const res = await service.getPublicProfileByUsername('dante');

      expect(res).toEqual({
        id: 'user-1',
        displayName: 'Dante',
        username: 'dante',
        githubUrl: 'https://github.com/dante',
        websiteUrl: 'https://dante.example.com',
        joinedAt: '2026-01-01T00:00:00.000Z',
        totalTokens: 1000000n,
        topTools: [{ sourceKey: 'claude-code', totalTokens: 1000000n }],
        topModels: [
          {
            modelIdentityKey: 'claude-sonnet',
            displayName: 'Claude Sonnet',
            totalTokens: 1000000n,
          },
        ],
        activityCalendar: [{ date: '2026-01-01', totalTokens: 1000000n }],
      });
    });

    it('throws UserNotFoundError when user is opted out', async () => {
      const repo = makeRepo({
        findByUsername: async () =>
          makeUser({
            leaderboard: { optIn: false, optedInAt: null },
          }),
      });
      const { scheduler } = makeScheduler();
      const service = new UsersService(repo, scheduler, clock);

      await expect(service.getPublicProfileByUsername('dante')).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });

    it('throws UserNotFoundError when user does not exist', async () => {
      const repo = makeRepo({
        findByUsername: async () => null,
      });
      const { scheduler } = makeScheduler();
      const service = new UsersService(repo, scheduler, clock);

      await expect(service.getPublicProfileByUsername('nonexistent')).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });
  });
});

import type { Clock } from '../../../shared/time';
import { GetLeaderboardService } from './get-leaderboard.service';
import { LeaderboardError } from './leaderboard.errors';
import type {
  LeaderboardModelRow,
  LeaderboardProfileRow,
  LeaderboardRepository,
  LeaderboardScoreRow,
  LeaderboardToolRow,
} from './ports/leaderboard.repository';

function fixedClock(now: Date): Clock {
  return { now: () => new Date(now.getTime()) };
}

function unimplemented(): never {
  throw new Error('not implemented');
}

function makeRepo(overrides: Partial<LeaderboardRepository>): LeaderboardRepository {
  return {
    listScores: async () => unimplemented(),
    getUserScore: async () => unimplemented(),
    getUserRank: async () => unimplemented(),
    loadProfiles: async () => unimplemented(),
    loadTopTools: async () => unimplemented(),
    loadTopModels: async () => unimplemented(),
    earliestOptedInUsageDate: async () => null,
    ...overrides,
  };
}

describe('GetLeaderboardService', () => {
  const now = new Date('2026-07-23T13:00:00.000Z');
  const clock = fixedClock(now);

  it('rejects invalid window', async () => {
    const service = new GetLeaderboardService(makeRepo({}), clock);
    await expect(service.execute({ window: '1d' })).rejects.toBeInstanceOf(LeaderboardError);
  });

  it('rejects non-tokens metric', async () => {
    const service = new GetLeaderboardService(makeRepo({}), clock);
    await expect(service.execute({ window: '7d', metric: 'cost' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('returns empty entries with 7d UTC window', async () => {
    const service = new GetLeaderboardService(
      makeRepo({
        listScores: async () => [],
      }),
      clock,
    );

    const res = await service.execute({ window: '7d' });
    expect(res.window).toBe('7d');
    expect(res.windowStartDate).toBe('2026-07-17');
    expect(res.windowEndDate).toBe('2026-07-23');
    expect(res.entries).toEqual([]);
    expect(res.nextCursor).toBeNull();
    expect(res.viewer).toBeUndefined();
  });

  it('ranks by tokens and resolves display names', async () => {
    const scores: LeaderboardScoreRow[] = [
      { userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', totalTokens: 200n },
      { userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', totalTokens: 100n },
    ];
    const profiles: LeaderboardProfileRow[] = [
      {
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        displayName: 'Alpha',
        givenName: null,
        familyName: null,
        leaderboardOptIn: true,
      },
      {
        userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        displayName: null,
        givenName: 'Beta',
        familyName: 'User',
        leaderboardOptIn: true,
      },
    ];
    const tools: LeaderboardToolRow[] = [
      {
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        sourceKey: 'claude-code',
        totalTokens: 150n,
      },
    ];
    const models: LeaderboardModelRow[] = [
      {
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        modelIdentityKey: 'sonnet',
        displayName: 'Sonnet',
        totalTokens: 150n,
      },
    ];

    const service = new GetLeaderboardService(
      makeRepo({
        listScores: async () => scores,
        loadProfiles: async () => profiles,
        loadTopTools: async () => tools,
        loadTopModels: async () => models,
      }),
      clock,
    );

    const res = await service.execute({ window: '7d' });
    expect(res.entries).toHaveLength(2);
    expect(res.entries[0]).toMatchObject({
      rank: 1,
      displayName: 'Alpha',
      totalTokens: 200,
      avatarUrl: null,
    });
    expect(res.entries[0]?.tools).toEqual([{ sourceKey: 'claude-code', totalTokens: 150 }]);
    expect(res.entries[1]).toMatchObject({
      rank: 2,
      displayName: 'Beta User',
      totalTokens: 100,
    });
  });

  it('attaches viewer opted_out when not opted in', async () => {
    const service = new GetLeaderboardService(
      makeRepo({
        listScores: async () => [],
        loadProfiles: async () => [
          {
            userId: 'viewer-1',
            displayName: 'V',
            givenName: null,
            familyName: null,
            leaderboardOptIn: false,
          },
        ],
      }),
      clock,
    );

    const res = await service.execute({ window: 'all', viewerUserId: 'viewer-1' });
    expect(res.viewer).toEqual({ status: 'opted_out' });
  });

  it('attaches ranked viewer when opted in with score', async () => {
    const service = new GetLeaderboardService(
      makeRepo({
        listScores: async () => [],
        loadProfiles: async () => [
          {
            userId: 'viewer-1',
            displayName: 'Champ',
            givenName: null,
            familyName: null,
            leaderboardOptIn: true,
          },
        ],
        getUserScore: async () => 999n,
        getUserRank: async () => 3,
        loadTopTools: async () => [],
        loadTopModels: async () => [],
      }),
      clock,
    );

    const res = await service.execute({ window: '30d', viewerUserId: 'viewer-1' });
    expect(res.viewer).toMatchObject({
      status: 'ranked',
      entry: { rank: 3, displayName: 'Champ', totalTokens: 999 },
    });
  });
});

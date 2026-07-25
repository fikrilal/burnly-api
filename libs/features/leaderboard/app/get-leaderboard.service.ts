import type { Clock } from '../../../shared/time';
import { decodeLeaderboardCursor, encodeLeaderboardCursor } from '../domain/cursor';
import { resolvePublicDisplayName } from '../domain/display-name';
import {
  isLeaderboardWindow,
  resolveLeaderboardWindow,
  type LeaderboardWindow,
} from '../domain/windows';
import { bigintToJsonNumber } from './json-bigint';
import { LeaderboardError } from './leaderboard.errors';
import {
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  LEADERBOARD_TOP_N,
} from './leaderboard.limits';
import type {
  LeaderboardModelRow,
  LeaderboardProfileRow,
  LeaderboardRepository,
  LeaderboardToolRow,
} from './ports/leaderboard.repository';
import { ErrorCode } from '../../../shared/error-codes';

export type LeaderboardToolView = Readonly<{
  sourceKey: string;
  totalTokens: number | string;
}>;

export type LeaderboardModelView = Readonly<{
  modelIdentityKey: string;
  displayName: string | null;
  totalTokens: number | string;
}>;

export type LeaderboardEntryView = Readonly<{
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  totalTokens: number | string;
  tools: ReadonlyArray<LeaderboardToolView>;
  models: ReadonlyArray<LeaderboardModelView>;
  toolsOmitted: number;
  modelsOmitted: number;
}>;

export type LeaderboardViewerPresent = Readonly<{
  status: 'ranked';
  entry: LeaderboardEntryView;
}>;

export type LeaderboardViewerAbsent = Readonly<{
  status: 'opted_out' | 'no_activity';
}>;

export type LeaderboardViewerView = LeaderboardViewerPresent | LeaderboardViewerAbsent;

export type LeaderboardListView = Readonly<{
  window: LeaderboardWindow;
  metric: 'tokens';
  windowStartDate: string | null;
  windowEndDate: string;
  generatedAt: string;
  entries: ReadonlyArray<LeaderboardEntryView>;
  viewer?: LeaderboardViewerView;
  nextCursor: string | null;
}>;

export type GetLeaderboardInput = Readonly<{
  window: string;
  metric?: string;
  limit?: number;
  cursor?: string;
  /** When set, attach viewer context (soft auth). */
  viewerUserId?: string;
}>;

function validationFailed(issues: ReadonlyArray<{ field?: string; message: string }>): never {
  throw new LeaderboardError({
    status: 400,
    code: ErrorCode.VALIDATION_FAILED,
    message: 'Validation failed',
    issues,
  });
}

function parseLimit(raw: number | undefined): number {
  if (raw === undefined) return LEADERBOARD_DEFAULT_LIMIT;
  if (!Number.isInteger(raw) || raw < 1 || raw > LEADERBOARD_MAX_LIMIT) {
    validationFailed([
      {
        field: 'limit',
        message: `limit must be an integer between 1 and ${LEADERBOARD_MAX_LIMIT}`,
      },
    ]);
  }
  return raw;
}

function groupToolsByUser(
  rows: ReadonlyArray<LeaderboardToolRow>,
): Map<string, LeaderboardToolRow[]> {
  const map = new Map<string, LeaderboardToolRow[]>();
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push(row);
    map.set(row.userId, list);
  }
  return map;
}

function groupModelsByUser(
  rows: ReadonlyArray<LeaderboardModelRow>,
): Map<string, LeaderboardModelRow[]> {
  const map = new Map<string, LeaderboardModelRow[]>();
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push(row);
    map.set(row.userId, list);
  }
  return map;
}

function profileMap(
  rows: ReadonlyArray<LeaderboardProfileRow>,
): Map<string, LeaderboardProfileRow> {
  const map = new Map<string, LeaderboardProfileRow>();
  for (const row of rows) {
    map.set(row.userId, row);
  }
  return map;
}

function takeTopWithOmitted<T>(
  items: ReadonlyArray<T>,
  topN: number,
): {
  items: ReadonlyArray<T>;
  omitted: number;
} {
  if (items.length <= topN) {
    return { items, omitted: 0 };
  }
  return { items: items.slice(0, topN), omitted: items.length - topN };
}

export class GetLeaderboardService {
  constructor(
    private readonly repo: LeaderboardRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetLeaderboardInput): Promise<LeaderboardListView> {
    if (!isLeaderboardWindow(input.window)) {
      validationFailed([{ field: 'window', message: 'window must be one of: 7d, 30d, all' }]);
    }

    const metric = input.metric ?? 'tokens';
    if (metric !== 'tokens') {
      validationFailed([
        {
          field: 'metric',
          message: 'metric must be tokens (cost and streak are not available yet)',
        },
      ]);
    }

    const limit = parseLimit(input.limit);

    let cursorPayload = null;
    if (input.cursor !== undefined && input.cursor !== '') {
      cursorPayload = decodeLeaderboardCursor(input.cursor);
      if (!cursorPayload) {
        validationFailed([{ field: 'cursor', message: 'cursor is invalid' }]);
      }
    }

    const now = this.clock.now();
    const range = resolveLeaderboardWindow(input.window, now);
    const bounds = {
      windowStartDate: range.windowStartDate,
      windowEndDate: range.windowEndDate,
    };

    const fetchLimit = limit + 1;
    const scoreRows = await this.repo.listScores({
      window: input.window,
      windowStartDate: range.windowStartDate,
      windowEndDate: range.windowEndDate,
      limit: fetchLimit,
      cursor: cursorPayload,
    });

    const pageRows = scoreRows.slice(0, limit);
    const hasMore = scoreRows.length > limit;

    const userIds = pageRows.map((r) => r.userId);
    const [profiles, tools, models] = await Promise.all([
      userIds.length > 0 ? this.repo.loadProfiles(userIds) : Promise.resolve([]),
      userIds.length > 0
        ? this.repo.loadTopTools(userIds, bounds, LEADERBOARD_TOP_N)
        : Promise.resolve([]),
      userIds.length > 0
        ? this.repo.loadTopModels(userIds, bounds, LEADERBOARD_TOP_N)
        : Promise.resolve([]),
    ]);

    const profilesById = profileMap(profiles);
    const toolsByUser = groupToolsByUser(tools);
    const modelsByUser = groupModelsByUser(models);

    // Rank is unique ordinal: for first page starts at 1; with cursor we need offset.
    // Keyset cursor does not encode rank offset — recompute rank from position among
    // full sort by counting how many are strictly ahead of the first row on this page.
    let rankBase = 1;
    if (cursorPayload && pageRows[0]) {
      const first = pageRows[0];
      const rank = await this.repo.getUserRank(first.userId, first.totalTokens, bounds);
      rankBase = rank ?? 1;
    }

    const entries: LeaderboardEntryView[] = pageRows.map((row, index) => {
      const profile = profilesById.get(row.userId);
      const toolRows = toolsByUser.get(row.userId) ?? [];
      const modelRows = modelsByUser.get(row.userId) ?? [];
      const toolsSlice = takeTopWithOmitted(toolRows, LEADERBOARD_TOP_N);
      const modelsSlice = takeTopWithOmitted(modelRows, LEADERBOARD_TOP_N);

      return {
        rank: rankBase + index,
        userId: row.userId,
        displayName: resolvePublicDisplayName(
          {
            displayName: profile?.displayName ?? null,
            givenName: profile?.givenName ?? null,
            familyName: profile?.familyName ?? null,
          },
          row.userId,
        ),
        avatarUrl: null,
        githubUrl: profile?.githubUrl ?? null,
        websiteUrl: profile?.websiteUrl ?? null,
        totalTokens: bigintToJsonNumber(row.totalTokens),
        tools: toolsSlice.items.map((t) => ({
          sourceKey: t.sourceKey,
          totalTokens: bigintToJsonNumber(t.totalTokens),
        })),
        models: modelsSlice.items.map((m) => ({
          modelIdentityKey: m.modelIdentityKey,
          displayName: m.displayName,
          totalTokens: bigintToJsonNumber(m.totalTokens),
        })),
        toolsOmitted: toolsSlice.omitted,
        modelsOmitted: modelsSlice.omitted,
      };
    });

    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];
      if (last) {
        nextCursor = encodeLeaderboardCursor({
          totalTokens: last.totalTokens.toString(),
          userId: last.userId,
        });
      }
    }

    let windowStartDate = range.windowStartDate;
    if (input.window === 'all') {
      windowStartDate = await this.repo.earliestOptedInUsageDate();
    }

    const result: LeaderboardListView = {
      window: input.window,
      metric: 'tokens',
      windowStartDate,
      windowEndDate: range.windowEndDate,
      generatedAt: now.toISOString(),
      entries,
      nextCursor,
    };

    if (input.viewerUserId) {
      const viewer = await this.buildViewer(input.viewerUserId, bounds, profilesById);
      return { ...result, viewer };
    }

    return result;
  }

  private async buildViewer(
    userId: string,
    bounds: { windowStartDate: string | null; windowEndDate: string },
    pageProfiles: Map<string, LeaderboardProfileRow>,
  ): Promise<LeaderboardViewerView> {
    let profile = pageProfiles.get(userId);
    if (!profile) {
      const loaded = await this.repo.loadProfiles([userId]);
      profile = loaded[0];
    }

    if (!profile || !profile.leaderboardOptIn) {
      return { status: 'opted_out' };
    }

    const score = await this.repo.getUserScore(userId, bounds);
    if (score === null || score <= 0n) {
      return { status: 'no_activity' };
    }

    const rank = await this.repo.getUserRank(userId, score, bounds);
    if (rank === null) {
      return { status: 'no_activity' };
    }

    const [tools, models] = await Promise.all([
      this.repo.loadTopTools([userId], bounds, LEADERBOARD_TOP_N),
      this.repo.loadTopModels([userId], bounds, LEADERBOARD_TOP_N),
    ]);
    const toolsSlice = takeTopWithOmitted(tools, LEADERBOARD_TOP_N);
    const modelsSlice = takeTopWithOmitted(models, LEADERBOARD_TOP_N);

    const entry: LeaderboardEntryView = {
      rank,
      userId,
      displayName: resolvePublicDisplayName(
        {
          displayName: profile.displayName,
          givenName: profile.givenName,
          familyName: profile.familyName,
        },
        userId,
      ),
      avatarUrl: null,
      githubUrl: profile.githubUrl,
      websiteUrl: profile.websiteUrl,
      totalTokens: bigintToJsonNumber(score),
      tools: toolsSlice.items.map((t) => ({
        sourceKey: t.sourceKey,
        totalTokens: bigintToJsonNumber(t.totalTokens),
      })),
      models: modelsSlice.items.map((m) => ({
        modelIdentityKey: m.modelIdentityKey,
        displayName: m.displayName,
        totalTokens: bigintToJsonNumber(m.totalTokens),
      })),
      toolsOmitted: toolsSlice.omitted,
      modelsOmitted: modelsSlice.omitted,
    };

    return { status: 'ranked', entry };
  }
}

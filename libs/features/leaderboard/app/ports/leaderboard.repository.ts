import type { LeaderboardCursorPayload } from '../../domain/cursor';
import type { LeaderboardWindow } from '../../domain/windows';

export type LeaderboardScoreRow = Readonly<{
  userId: string;
  totalTokens: bigint;
}>;

export type LeaderboardProfileRow = Readonly<{
  userId: string;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  leaderboardOptIn: boolean;
}>;

export type LeaderboardToolRow = Readonly<{
  userId: string;
  sourceKey: string;
  totalTokens: bigint;
}>;

export type LeaderboardModelRow = Readonly<{
  userId: string;
  modelIdentityKey: string;
  displayName: string | null;
  totalTokens: bigint;
}>;

export type ListScoresInput = Readonly<{
  window: LeaderboardWindow;
  windowStartDate: string | null;
  windowEndDate: string;
  limit: number;
  cursor: LeaderboardCursorPayload | null;
}>;

export type WindowBounds = Readonly<{
  windowStartDate: string | null;
  windowEndDate: string;
}>;

export interface LeaderboardRepository {
  listScores(input: ListScoresInput): Promise<ReadonlyArray<LeaderboardScoreRow>>;

  getUserScore(userId: string, bounds: WindowBounds): Promise<bigint | null>;

  /**
   * 1-based rank among opted-in users with score > 0 using the same sort as the list.
   * null if user has no qualifying score.
   */
  getUserRank(userId: string, totalTokens: bigint, bounds: WindowBounds): Promise<number | null>;

  loadProfiles(userIds: ReadonlyArray<string>): Promise<ReadonlyArray<LeaderboardProfileRow>>;

  loadTopTools(
    userIds: ReadonlyArray<string>,
    bounds: WindowBounds,
    topN: number,
  ): Promise<ReadonlyArray<LeaderboardToolRow>>;

  loadTopModels(
    userIds: ReadonlyArray<string>,
    bounds: WindowBounds,
    topN: number,
  ): Promise<ReadonlyArray<LeaderboardModelRow>>;

  /** Earliest usage date among opted-in active facts (for `all` windowStartDate). */
  earliestOptedInUsageDate(): Promise<string | null>;
}

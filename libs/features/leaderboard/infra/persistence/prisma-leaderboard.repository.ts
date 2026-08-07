import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import type { LeaderboardCursorPayload } from '../../domain/cursor';
import type {
  LeaderboardModelRow,
  LeaderboardProfileRow,
  LeaderboardRepository,
  LeaderboardScoreRow,
  LeaderboardToolRow,
  ListScoresInput,
  WindowBounds,
} from '../../app/ports/leaderboard.repository';

type ScoreRaw = Readonly<{
  user_id: string;
  total_tokens: bigint;
}>;

type ProfileRaw = Readonly<{
  userId: string;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  username: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  leaderboardOptIn: boolean;
}>;

type ToolRaw = Readonly<{
  user_id: string;
  source_key: string;
  total_tokens: bigint;
  rn: bigint;
}>;

type ModelRaw = Readonly<{
  user_id: string;
  model_identity_key: string;
  display_name: string | null;
  total_tokens: bigint;
  rn: bigint;
}>;

function dateFilterSql(bounds: WindowBounds): Prisma.Sql {
  if (bounds.windowStartDate === null) {
    return Prisma.sql`AND f."usageDate" <= ${bounds.windowEndDate}::date`;
  }
  return Prisma.sql`AND f."usageDate" >= ${bounds.windowStartDate}::date AND f."usageDate" <= ${bounds.windowEndDate}::date`;
}

function cursorFilterSql(cursor: LeaderboardCursorPayload | null): Prisma.Sql {
  if (!cursor) return Prisma.empty;
  const tokens = BigInt(cursor.totalTokens);
  return Prisma.sql`AND (
    s.total_tokens < ${tokens}
    OR (s.total_tokens = ${tokens} AND s.user_id > ${cursor.userId}::uuid)
  )`;
}

@Injectable()
export class PrismaLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listScores(input: ListScoresInput): Promise<ReadonlyArray<LeaderboardScoreRow>> {
    const client = this.prisma.getClient();
    const bounds: WindowBounds = {
      windowStartDate: input.windowStartDate,
      windowEndDate: input.windowEndDate,
    };
    const dateFilter = dateFilterSql(bounds);
    const cursorFilter = cursorFilterSql(input.cursor);

    const rows = await client.$queryRaw<ScoreRaw[]>`
      WITH scores AS (
        SELECT
          f."userId" AS user_id,
          SUM(f."totalTokens") AS total_tokens
        FROM "DailyUsageFact" f
        INNER JOIN "User" u ON u.id = f."userId"
        INNER JOIN "UserProfile" p ON p."userId" = f."userId"
        WHERE p."leaderboardOptIn" = true
          AND u.status = 'ACTIVE'::"UserStatus"
          AND u."deletionRequestedAt" IS NULL
          AND f."recordState" = 'active'::"UsageRecordState"
          ${dateFilter}
        GROUP BY f."userId"
        HAVING SUM(f."totalTokens") > 0
      )
      SELECT s.user_id, s.total_tokens
      FROM scores s
      WHERE TRUE
        ${cursorFilter}
      ORDER BY s.total_tokens DESC, s.user_id ASC
      LIMIT ${input.limit}
    `;

    return rows.map((r) => ({
      userId: r.user_id,
      totalTokens: BigInt(r.total_tokens),
    }));
  }

  async getUserScore(userId: string, bounds: WindowBounds): Promise<bigint | null> {
    const client = this.prisma.getClient();
    const dateFilter = dateFilterSql(bounds);

    const rows = await client.$queryRaw<Array<{ total_tokens: bigint | null }>>`
      SELECT SUM(f."totalTokens") AS total_tokens
      FROM "DailyUsageFact" f
      INNER JOIN "User" u ON u.id = f."userId"
      INNER JOIN "UserProfile" p ON p."userId" = f."userId"
      WHERE f."userId" = ${userId}::uuid
        AND p."leaderboardOptIn" = true
        AND u.status = 'ACTIVE'::"UserStatus"
        AND u."deletionRequestedAt" IS NULL
        AND f."recordState" = 'active'::"UsageRecordState"
        ${dateFilter}
    `;

    const total = rows[0]?.total_tokens;
    if (total === null || total === undefined) return null;
    const value = BigInt(total);
    if (value <= 0n) return null;
    return value;
  }

  async getUserRank(
    userId: string,
    totalTokens: bigint,
    bounds: WindowBounds,
  ): Promise<number | null> {
    const client = this.prisma.getClient();
    const dateFilter = dateFilterSql(bounds);

    const rows = await client.$queryRaw<Array<{ rank: bigint }>>`
      WITH scores AS (
        SELECT
          f."userId" AS user_id,
          SUM(f."totalTokens") AS total_tokens
        FROM "DailyUsageFact" f
        INNER JOIN "User" u ON u.id = f."userId"
        INNER JOIN "UserProfile" p ON p."userId" = f."userId"
        WHERE p."leaderboardOptIn" = true
          AND u.status = 'ACTIVE'::"UserStatus"
          AND u."deletionRequestedAt" IS NULL
          AND f."recordState" = 'active'::"UsageRecordState"
          ${dateFilter}
        GROUP BY f."userId"
        HAVING SUM(f."totalTokens") > 0
      )
      SELECT (
        1 + COUNT(*)::bigint
      ) AS rank
      FROM scores s
      WHERE s.total_tokens > ${totalTokens}
         OR (s.total_tokens = ${totalTokens} AND s.user_id < ${userId}::uuid)
    `;

    const rank = rows[0]?.rank;
    if (rank === undefined) return null;
    return Number(rank);
  }

  async loadProfiles(
    userIds: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<LeaderboardProfileRow>> {
    if (userIds.length === 0) return [];
    const client = this.prisma.getClient();
    const rows = await client.userProfile.findMany({
      where: { userId: { in: [...userIds] } },
      select: {
        userId: true,
        displayName: true,
        givenName: true,
        familyName: true,
        username: true,
        githubUrl: true,
        websiteUrl: true,
        leaderboardOptIn: true,
      },
    });

    return rows.map(
      (r: ProfileRaw): LeaderboardProfileRow => ({
        userId: r.userId,
        displayName: r.displayName,
        givenName: r.givenName,
        familyName: r.familyName,
        username: r.username,
        githubUrl: r.githubUrl,
        websiteUrl: r.websiteUrl,
        leaderboardOptIn: r.leaderboardOptIn,
      }),
    );
  }

  async loadTopTools(
    userIds: ReadonlyArray<string>,
    bounds: WindowBounds,
    topN: number,
  ): Promise<ReadonlyArray<LeaderboardToolRow>> {
    if (userIds.length === 0) return [];
    const client = this.prisma.getClient();
    const dateFilter = dateFilterSql(bounds);
    const ids = userIds.map((id) => Prisma.sql`${id}::uuid`);

    const rows = await client.$queryRaw<ToolRaw[]>`
      WITH tool_scores AS (
        SELECT
          f."userId" AS user_id,
          f."sourceKey" AS source_key,
          SUM(f."totalTokens") AS total_tokens
        FROM "DailyUsageFact" f
        WHERE f."userId" IN (${Prisma.join(ids)})
          AND f."recordState" = 'active'::"UsageRecordState"
          ${dateFilter}
        GROUP BY f."userId", f."sourceKey"
      ),
      ranked AS (
        SELECT
          user_id,
          source_key,
          total_tokens,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY total_tokens DESC, source_key ASC
          ) AS rn
        FROM tool_scores
      )
      SELECT user_id, source_key, total_tokens, rn
      FROM ranked
      WHERE rn <= ${topN}
      ORDER BY user_id ASC, rn ASC
    `;

    return rows.map((r) => ({
      userId: r.user_id,
      sourceKey: r.source_key,
      totalTokens: BigInt(r.total_tokens),
    }));
  }

  async loadTopModels(
    userIds: ReadonlyArray<string>,
    bounds: WindowBounds,
    topN: number,
  ): Promise<ReadonlyArray<LeaderboardModelRow>> {
    if (userIds.length === 0) return [];
    const client = this.prisma.getClient();
    const dateFilter = dateFilterSql(bounds);
    const ids = userIds.map((id) => Prisma.sql`${id}::uuid`);

    const rows = await client.$queryRaw<ModelRaw[]>`
      WITH model_scores AS (
        SELECT
          m."userId" AS user_id,
          m."modelIdentityKey" AS model_identity_key,
          MAX(m."displayName") AS display_name,
          SUM(COALESCE(m."totalTokens", 0)) AS total_tokens
        FROM "DailyModelUsageFact" m
        INNER JOIN "DailyUsageFact" f ON f.id = m."dailyUsageFactId"
        WHERE m."userId" IN (${Prisma.join(ids)})
          AND f."recordState" = 'active'::"UsageRecordState"
          ${dateFilter}
        GROUP BY m."userId", m."modelIdentityKey"
      ),
      ranked AS (
        SELECT
          user_id,
          model_identity_key,
          display_name,
          total_tokens,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY total_tokens DESC, model_identity_key ASC
          ) AS rn
        FROM model_scores
        WHERE total_tokens > 0
      )
      SELECT user_id, model_identity_key, display_name, total_tokens, rn
      FROM ranked
      WHERE rn <= ${topN}
      ORDER BY user_id ASC, rn ASC
    `;

    return rows.map((r) => ({
      userId: r.user_id,
      modelIdentityKey: r.model_identity_key,
      displayName: r.display_name,
      totalTokens: BigInt(r.total_tokens),
    }));
  }

  async earliestOptedInUsageDate(): Promise<string | null> {
    const client = this.prisma.getClient();
    const rows = await client.$queryRaw<Array<{ min_date: Date | null }>>`
      SELECT MIN(f."usageDate") AS min_date
      FROM "DailyUsageFact" f
      INNER JOIN "User" u ON u.id = f."userId"
      INNER JOIN "UserProfile" p ON p."userId" = f."userId"
      WHERE p."leaderboardOptIn" = true
        AND u.status = 'ACTIVE'::"UserStatus"
        AND u."deletionRequestedAt" IS NULL
        AND f."recordState" = 'active'::"UsageRecordState"
    `;

    const minDate = rows[0]?.min_date;
    if (!minDate) return null;
    const year = minDate.getUTCFullYear();
    const month = String(minDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(minDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LEADERBOARD_DEFAULT_LIMIT, LEADERBOARD_MAX_LIMIT } from '../../../app/leaderboard.limits';

export class LeaderboardQueryDto {
  @ApiProperty({
    enum: ['7d', '30d', 'all'],
    example: '7d',
    description: 'UTC calendar window ending today UTC (ADR 0023).',
  })
  @IsString()
  @IsIn(['7d', '30d', 'all'])
  window!: '7d' | '30d' | 'all';

  @ApiPropertyOptional({
    enum: ['tokens'],
    example: 'tokens',
    description: 'Ranking metric. v1 only accepts tokens.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['tokens'])
  metric?: 'tokens';

  @ApiPropertyOptional({
    type: Number,
    example: LEADERBOARD_DEFAULT_LIMIT,
    minimum: 1,
    maximum: LEADERBOARD_MAX_LIMIT,
    description: `Page size (default ${LEADERBOARD_DEFAULT_LIMIT}, max ${LEADERBOARD_MAX_LIMIT}).`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LEADERBOARD_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    type: String,
    description: 'Opaque keyset cursor from a previous response meta.nextCursor.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class LeaderboardToolDto {
  @ApiProperty({ example: 'claude-code' })
  sourceKey!: string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 90000000,
    description: 'Token total for this tool in the window (number or string for large values).',
  })
  totalTokens!: number | string;
}

export class LeaderboardModelDto {
  @ApiProperty({ example: 'claude-sonnet-4' })
  modelIdentityKey!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Claude Sonnet 4' })
  displayName!: string | null;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 80000000,
  })
  totalTokens!: number | string;
}

export class LeaderboardEntryDto {
  @ApiProperty({ example: 1 })
  rank!: number;

  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  userId!: string;

  @ApiProperty({ example: 'Ahmad Fikril' })
  displayName!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'dante',
    description: 'Public handle/username when provided by the user.',
  })
  username!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Public avatar URL when available; null in v1 (auth-only images).',
  })
  avatarUrl!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://github.com/username',
    description: 'Public GitHub URL when provided by the user.',
  })
  githubUrl!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'https://example.com',
    description: 'Public website URL when provided by the user.',
  })
  websiteUrl!: string | null;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 128400000,
  })
  totalTokens!: number | string;

  @ApiProperty({ type: [LeaderboardToolDto] })
  tools!: LeaderboardToolDto[];

  @ApiProperty({ type: [LeaderboardModelDto] })
  models!: LeaderboardModelDto[];

  @ApiProperty({ example: 0 })
  toolsOmitted!: number;

  @ApiProperty({ example: 0 })
  modelsOmitted!: number;
}

export class LeaderboardViewerDto {
  @ApiProperty({
    enum: ['ranked', 'opted_out', 'no_activity'],
    example: 'ranked',
    description:
      'ranked: entry present with rank. opted_out: not participating. no_activity: opted in but score 0.',
  })
  status!: 'ranked' | 'opted_out' | 'no_activity';

  @ApiPropertyOptional({
    type: LeaderboardEntryDto,
    description: 'Present only when status is ranked.',
  })
  entry?: LeaderboardEntryDto;
}

export class LeaderboardDataDto {
  @ApiProperty({ enum: ['7d', '30d', 'all'], example: '7d' })
  window!: '7d' | '30d' | 'all';

  @ApiProperty({ enum: ['tokens'], example: 'tokens' })
  metric!: 'tokens';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-07-17',
    description: 'Inclusive UTC start date; may be null for empty all-time board.',
  })
  windowStartDate!: string | null;

  @ApiProperty({ example: '2026-07-23' })
  windowEndDate!: string;

  @ApiProperty({ example: '2026-07-23T13:00:00.000Z', format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ type: [LeaderboardEntryDto] })
  entries!: LeaderboardEntryDto[];

  @ApiPropertyOptional({
    type: LeaderboardViewerDto,
    description:
      'Present when a valid Bearer token is provided. Omitted for anonymous requests. ' +
      'Invalid tokens are treated as anonymous (list still returns 200).',
  })
  viewer?: LeaderboardViewerDto;
}

export class LeaderboardMetaDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Opaque cursor for the next page; null when no more rows.',
  })
  nextCursor!: string | null;
}

export class LeaderboardEnvelopeDto {
  @ApiProperty({ type: LeaderboardDataDto })
  data!: LeaderboardDataDto;

  @ApiProperty({ type: LeaderboardMetaDto })
  meta!: LeaderboardMetaDto;
}

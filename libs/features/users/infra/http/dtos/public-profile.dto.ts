import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicProfileToolItemDto {
  @ApiProperty({ example: 'claude-code' })
  sourceKey!: string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 90000000,
  })
  totalTokens!: number | string;
}

export class PublicProfileModelItemDto {
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

export class PublicProfileCalendarDayDto {
  @ApiProperty({ example: '2026-07-25' })
  date!: string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 1500000,
  })
  totalTokens!: number | string;
}

export class PublicProfileDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Dante' })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'dante' })
  username!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://github.com/dante' })
  githubUrl!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'https://dante.example.com' })
  websiteUrl!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z', format: 'date-time' })
  joinedAt!: string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 170000000,
  })
  totalTokens!: number | string;

  @ApiProperty({ type: [PublicProfileToolItemDto] })
  topTools!: PublicProfileToolItemDto[];

  @ApiProperty({ type: [PublicProfileModelItemDto] })
  topModels!: PublicProfileModelItemDto[];

  @ApiProperty({ type: [PublicProfileCalendarDayDto] })
  activityCalendar!: PublicProfileCalendarDayDto[];
}

export class PublicProfileEnvelopeDto {
  @ApiProperty({ type: PublicProfileDto })
  data!: PublicProfileDto;
}

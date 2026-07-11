import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UsageModelsQueryDto {
  @ApiProperty({
    type: String,
    example: '2026-07-01',
    description: 'Inclusive range start (YYYY-MM-DD). Max 366 days with to.',
  })
  @IsString()
  @Matches(DATE_RE)
  from!: string;

  @ApiProperty({
    type: String,
    example: '2026-07-09',
    description: 'Inclusive range end (YYYY-MM-DD). Must be >= from.',
  })
  @IsString()
  @Matches(DATE_RE)
  to!: string;

  @ApiProperty({
    type: String,
    example: 'Asia/Jakarta',
    description: 'IANA timezone; filters parent aggregationTimezone (exact match).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  timezone!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'dev_abc123',
    description: 'Optional desktop clientDeviceId filter (not server UUID).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'claude-code',
    description: 'Optional product sourceKey filter.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceKey?: string;
}

export class UsageModelsParentTotalsDto {
  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 100000,
    description: 'Sum of active parent totalTokens (chart 100% baseline).',
  })
  totalTokens!: number | string;

  @ApiProperty({ type: Number, example: 40 })
  factCount!: number;
}

export class UsageModelsModelDto {
  @ApiProperty({
    type: String,
    example: 'claude-sonnet-4',
    description: 'Stable group key; unknown bucket uses __unknown__ sentinel.',
  })
  modelIdentityKey!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'claude-sonnet-4' })
  rawModelId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'anthropic' })
  providerKey!: string | null;

  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }], example: 80000 })
  totalTokens!: number | string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 50000,
  })
  inputTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 30000,
  })
  outputTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
  })
  cacheCreationTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
  })
  cacheReadTokens!: number | string | null;
}

export class UsageModelsAttributionDto {
  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 85000,
    description: 'Sum of model totalTokens (null model totals treated as 0).',
  })
  modelsSumTokens!: number | string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 100000,
    description: 'Same as parentTotals.totalTokens — authoritative chart baseline.',
  })
  parentTotalTokens!: number | string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 15000,
    description: 'max(0, parentTotalTokens - modelsSumTokens).',
  })
  unattributedTokens!: number | string;
}

export class UsageModelsDataDto {
  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  timezone!: string;

  @ApiProperty({ type: String, example: '2026-07-01' })
  from!: string;

  @ApiProperty({ type: String, example: '2026-07-09' })
  to!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  deviceFilter!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  sourceFilter!: string | null;

  @ApiProperty({ type: UsageModelsParentTotalsDto })
  parentTotals!: UsageModelsParentTotalsDto;

  @ApiProperty({ type: [UsageModelsModelDto] })
  models!: UsageModelsModelDto[];

  @ApiProperty({ type: UsageModelsAttributionDto })
  attribution!: UsageModelsAttributionDto;
}

export class UsageModelsEnvelopeDto {
  @ApiProperty({ type: UsageModelsDataDto })
  data!: UsageModelsDataDto;
}

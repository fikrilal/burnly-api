import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UsageSourcesQueryDto {
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
    description: 'IANA timezone; filters fact aggregationTimezone (exact match).',
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
}

export class UsageSourceRowDto {
  @ApiProperty({
    type: String,
    example: 'claude-code',
    description: 'Product source key (coding tool). Opaque string; new keys may appear over time.',
  })
  sourceKey!: string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 70000,
    description: 'Sum of active parent totalTokens for this source (never model children).',
  })
  totalTokens!: number | string;

  @ApiProperty({ type: Number, example: 20 })
  factCount!: number;
}

export class UsageSourcesParentTotalsDto {
  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 100000,
    description: 'Account-level sum of active parent totalTokens in the window.',
  })
  totalTokens!: number | string;

  @ApiProperty({ type: Number, example: 40 })
  factCount!: number;
}

export class UsageSourcesDataDto {
  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  timezone!: string;

  @ApiProperty({ type: String, example: '2026-07-01' })
  from!: string;

  @ApiProperty({ type: String, example: '2026-07-09' })
  to!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  deviceFilter!: string | null;

  @ApiProperty({ type: UsageSourcesParentTotalsDto })
  parentTotals!: UsageSourcesParentTotalsDto;

  @ApiProperty({ type: [UsageSourceRowDto] })
  sources!: UsageSourceRowDto[];
}

export class UsageSourcesMetaDto {
  @ApiProperty({ type: Number, example: 2, description: 'Number of sources in the list.' })
  sourceCount!: number;
}

export class UsageSourcesEnvelopeDto {
  @ApiProperty({ type: UsageSourcesDataDto })
  data!: UsageSourcesDataDto;

  @ApiProperty({ type: UsageSourcesMetaDto })
  meta!: UsageSourcesMetaDto;
}

export class UsageSourceModelsQueryDto extends UsageSourcesQueryDto {}

export class UsageSourceModelsModelDto {
  @ApiProperty({ type: String, example: 'claude-sonnet-4' })
  modelIdentityKey!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'claude-sonnet-4' })
  rawModelId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'anthropic' })
  providerKey!: string | null;

  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }], example: 65000 })
  totalTokens!: number | string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
  })
  inputTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
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

export class UsageSourceModelsAttributionDto {
  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }], example: 66000 })
  modelsSumTokens!: number | string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 70000,
    description: 'Parent totalTokens for this source only (chart baseline).',
  })
  parentTotalTokens!: number | string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 4000,
    description: 'max(0, parentTotalTokens - modelsSumTokens).',
  })
  unattributedTokens!: number | string;
}

export class UsageSourceModelsDataDto {
  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  timezone!: string;

  @ApiProperty({ type: String, example: '2026-07-01' })
  from!: string;

  @ApiProperty({ type: String, example: '2026-07-09' })
  to!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  deviceFilter!: string | null;

  @ApiProperty({ type: String, example: 'claude-code' })
  sourceKey!: string;

  @ApiProperty({ type: UsageSourcesParentTotalsDto })
  parentTotals!: UsageSourcesParentTotalsDto;

  @ApiProperty({ type: [UsageSourceModelsModelDto] })
  models!: UsageSourceModelsModelDto[];

  @ApiProperty({ type: UsageSourceModelsAttributionDto })
  attribution!: UsageSourceModelsAttributionDto;
}

export class UsageSourceModelsEnvelopeDto {
  @ApiProperty({ type: UsageSourceModelsDataDto })
  data!: UsageSourceModelsDataDto;
}

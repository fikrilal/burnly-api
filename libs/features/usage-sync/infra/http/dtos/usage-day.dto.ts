import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COST_STATUSES = ['available', 'estimated', 'partial', 'mixed', 'unavailable'] as const;
const PLATFORMS = ['linux', 'macos', 'windows'] as const;

export class UsageDayPathParamDto {
  @ApiProperty({ type: String, example: '2026-07-08', description: 'Calendar date YYYY-MM-DD' })
  @IsString()
  @Matches(DATE_RE)
  date!: string;
}

export class UsageDayQueryDto {
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

export class UsageDayCostDto {
  @ApiProperty({ enum: COST_STATUSES, example: 'estimated' })
  status!: (typeof COST_STATUSES)[number];

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 99999,
  })
  amountMicros!: number | string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'USD' })
  currency!: string | null;

  @ApiPropertyOptional({ type: Number, example: 2 })
  factsWithCost?: number;

  @ApiPropertyOptional({ type: Number, example: 2 })
  factsTotal?: number;
}

export class UsageDayTotalsDto {
  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 4200,
    description: 'Sum of parent totalTokens only (never model children).',
  })
  totalTokens!: number | string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 2500,
  })
  inputTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 1500,
  })
  outputTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 0,
  })
  cacheCreationTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 200,
  })
  cacheReadTokens!: number | string | null;

  @ApiProperty({ type: UsageDayCostDto })
  cost!: UsageDayCostDto;
}

export class UsageDayBySourceDto {
  @ApiProperty({ type: String, example: 'claude-code' })
  sourceKey!: string;

  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }], example: 3000 })
  totalTokens!: number | string;
}

export class UsageDayDeviceDto {
  @ApiProperty({ type: String, example: 'dev_abc123' })
  clientDeviceId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'laptop' })
  displayName!: string | null;

  @ApiProperty({ enum: PLATFORMS, example: 'linux' })
  platform!: (typeof PLATFORMS)[number];
}

export class UsageDayModelCostDto {
  @ApiProperty({ type: String, example: 'unavailable' })
  status!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  kind!: string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: null,
  })
  amountMicros!: number | string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  currency!: string | null;
}

export class UsageDayModelDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: 'claude-sonnet-4' })
  rawModelId!: string | null;

  @ApiProperty({ type: String, example: 'claude-sonnet-4' })
  modelIdentityKey!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'anthropic' })
  providerKey!: string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 2000,
  })
  totalTokens!: number | string | null;

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

  @ApiProperty({ type: UsageDayModelCostDto })
  cost!: UsageDayModelCostDto;
}

export class UsageDayModelAttributionDto {
  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 2000,
  })
  modelsTotalTokens!: number | string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 2100,
  })
  parentTotalTokens!: number | string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 100,
    description: 'max(0, parentTotalTokens - modelsTotalTokens); UI remainder slice.',
  })
  unattributedTokens!: number | string;
}

export class UsageDayFactDto {
  @ApiProperty({ type: String, example: 'claude-code:daily:v1:Asia/Jakarta:2026-07-08' })
  identityKey!: string;

  @ApiProperty({ type: Number, example: 1 })
  identityVersion!: number;

  @ApiProperty({ type: String, example: 'claude-code' })
  sourceKey!: string;

  @ApiProperty({ type: String, example: '2026-07-08' })
  usageDate!: string;

  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  aggregationTimezone!: string;

  @ApiProperty({ type: UsageDayDeviceDto })
  device!: UsageDayDeviceDto;

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

  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }], example: 2100 })
  totalTokens!: number | string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
  })
  unclassifiedTokens!: number | string | null;

  @ApiProperty({ type: UsageDayModelCostDto })
  cost!: UsageDayModelCostDto;

  @ApiProperty({ type: String, example: 'complete' })
  dataQuality!: string;

  @ApiProperty({ type: String, example: 'active' })
  recordState!: string;

  @ApiProperty({ type: String, example: '2026-07-09T02:00:00.000Z' })
  clientLastSeenAt!: string;

  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }], example: 42 })
  clientRevision!: number | string;

  @ApiProperty({ type: String, example: '2026-07-09T12:00:00.000Z' })
  syncedAt!: string;

  @ApiProperty({ type: [UsageDayModelDto] })
  models!: UsageDayModelDto[];

  @ApiProperty({ type: UsageDayModelAttributionDto })
  modelAttribution!: UsageDayModelAttributionDto;
}

export class UsageDayDataDto {
  @ApiProperty({ type: String, example: '2026-07-08' })
  date!: string;

  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  timezone!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  deviceFilter!: string | null;

  @ApiProperty({ type: UsageDayTotalsDto })
  totals!: UsageDayTotalsDto;

  @ApiProperty({ type: [UsageDayBySourceDto] })
  bySource!: UsageDayBySourceDto[];

  @ApiProperty({ type: [UsageDayFactDto] })
  facts!: UsageDayFactDto[];
}

export class UsageDayEnvelopeDto {
  @ApiProperty({ type: UsageDayDataDto })
  data!: UsageDayDataDto;
}

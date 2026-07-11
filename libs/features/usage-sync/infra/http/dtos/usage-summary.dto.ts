import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const COST_STATUSES = ['available', 'estimated', 'partial', 'mixed', 'unavailable'] as const;

export class UsageSummaryQueryDto {
  @ApiProperty({
    type: String,
    example: 'Asia/Jakarta',
    description:
      'IANA timezone. Defines today/week/month boundaries and filters fact aggregationTimezone (exact match).',
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

export class UsageSummaryCostDto {
  @ApiProperty({ enum: COST_STATUSES, example: 'partial' })
  status!: (typeof COST_STATUSES)[number];

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 123456,
    description: 'Sum of costAmountMicros for cost-bearing facts; null when mixed/unavailable.',
  })
  amountMicros!: number | string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'USD' })
  currency!: string | null;

  @ApiProperty({ type: Number, example: 3 })
  factsWithCost!: number;

  @ApiProperty({ type: Number, example: 5 })
  factsTotal!: number;
}

export class UsageSummaryPeriodDto {
  @ApiProperty({ type: String, example: '2026-07-15' })
  startDate!: string;

  @ApiProperty({ type: String, example: '2026-07-15' })
  endDate!: string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 12345,
    description: 'Sum of parent totalTokens (authoritative).',
  })
  totalTokens!: number | string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 8000,
  })
  inputTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 4000,
  })
  outputTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: null,
  })
  cacheCreationTokens!: number | string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 345,
  })
  cacheReadTokens!: number | string | null;

  @ApiProperty({ type: UsageSummaryCostDto })
  cost!: UsageSummaryCostDto;
}

export class UsageSummaryPeriodsDto {
  @ApiProperty({ type: UsageSummaryPeriodDto })
  today!: UsageSummaryPeriodDto;

  @ApiProperty({
    type: UsageSummaryPeriodDto,
    description: 'Last 7 calendar days including today (not ISO week).',
  })
  week!: UsageSummaryPeriodDto;

  @ApiProperty({ type: UsageSummaryPeriodDto })
  month!: UsageSummaryPeriodDto;
}

export class UsageSummaryDataDto {
  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  timezone!: string;

  @ApiProperty({ type: String, example: '2026-07-15T04:00:00.000Z' })
  asOf!: string;

  @ApiProperty({ type: UsageSummaryPeriodsDto })
  periods!: UsageSummaryPeriodsDto;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: null,
    description: 'Echo of deviceId query filter when set.',
  })
  deviceFilter!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-07-15T03:55:00.000Z',
    description: 'MAX(SyncDevice.lastSyncAt) for the user (or filtered device).',
  })
  lastSyncAt!: string | null;
}

export class UsageSummaryEnvelopeDto {
  @ApiProperty({ type: UsageSummaryDataDto })
  data!: UsageSummaryDataDto;
}

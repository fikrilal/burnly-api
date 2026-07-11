import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UsageCalendarQueryDto {
  @ApiProperty({
    type: String,
    example: '2026-06-01',
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

export class UsageCalendarDayDto {
  @ApiProperty({ type: String, example: '2026-06-02' })
  date!: string;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    example: 2100,
    description: 'Sum of active parent totalTokens for this date.',
  })
  totalTokens!: number | string;

  @ApiProperty({ type: Number, example: 2 })
  factCount!: number;

  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'true when factCount > 0 (heatmap / streak activity).',
  })
  active!: boolean;
}

export class UsageCalendarDataDto {
  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  timezone!: string;

  @ApiProperty({ type: String, example: '2026-06-01' })
  from!: string;

  @ApiProperty({ type: String, example: '2026-07-09' })
  to!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: null,
    description: 'Echo of deviceId query filter when set.',
  })
  deviceFilter!: string | null;

  @ApiProperty({ type: [UsageCalendarDayDto] })
  days!: UsageCalendarDayDto[];
}

export class UsageCalendarMetaDto {
  @ApiProperty({
    type: Number,
    example: 39,
    description: 'Number of days in the dense series (inclusive from..to).',
  })
  dayCount!: number;
}

export class UsageCalendarEnvelopeDto {
  @ApiProperty({ type: UsageCalendarDataDto })
  data!: UsageCalendarDataDto;

  @ApiProperty({ type: UsageCalendarMetaDto })
  meta!: UsageCalendarMetaDto;
}

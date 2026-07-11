import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Shared query field blocks for Phase 2 usage read endpoints.
 * Calendar validity, 366-day cap, and IANA timezone checks run in the app layer
 * (see usage-read-query.ts); DTOs enforce shape and length only.
 */
export class UsageReadTimezoneQueryDto {
  @ApiProperty({
    type: String,
    example: 'Asia/Jakarta',
    description: 'IANA reporting timezone; filters fact aggregationTimezone (exact match).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  timezone!: string;
}

export class UsageReadDeviceFilterQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: 'dev_abc123',
    description:
      'Optional desktop clientDeviceId filter (not server UUID). Omit for multi-device sum.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class UsageReadDateRangeQueryDto {
  @ApiProperty({
    type: String,
    example: '2026-06-01',
    description: 'Inclusive range start (YYYY-MM-DD). Max range 366 days with to.',
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
}

/** Composite helper type for OpenAPI composition docs (not registered alone). */
export class UsageReadRangeQueryDto extends UsageReadTimezoneQueryDto {
  @ApiProperty({ type: String, example: '2026-06-01' })
  @IsString()
  @Matches(DATE_RE)
  from!: string;

  @ApiProperty({ type: String, example: '2026-07-09' })
  @IsString()
  @Matches(DATE_RE)
  to!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'dev_abc123',
    description: 'Optional desktop clientDeviceId filter.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

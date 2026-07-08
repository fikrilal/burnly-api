import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class SyncUsageWindowDto {
  @ApiProperty({ example: '2026-07-08' })
  @IsString()
  @Matches(DATE_RE)
  startDate!: string;

  @ApiProperty({ example: '2026-07-08' })
  @IsString()
  @Matches(DATE_RE)
  endDate!: string;

  @ApiProperty({ enum: ['rolling'], example: 'rolling' })
  @IsIn(['rolling'])
  scope!: 'rolling';
}

/**
 * Fact bodies are validated deeply in the app layer (identity/cost invariants).
 * DTO enforces structure and array bounds only.
 */
export class PushDailyUsageRequestDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  contractVersion!: number;

  @ApiProperty({ example: 'example-device-1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientDeviceId!: string;

  @ApiProperty({ example: '0.1.20' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  appVersion!: string;

  @ApiProperty({ example: 'UTC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  reportingTimezone!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  clientRevision!: number;

  @ApiProperty({ type: SyncUsageWindowDto })
  @ValidateNested()
  @Type(() => SyncUsageWindowDto)
  window!: SyncUsageWindowDto;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Daily usage facts; deep validation in service.',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsObject({ each: true })
  facts!: Record<string, unknown>[];
}

export class PushDailyUsageCountsDto {
  @ApiProperty({ example: 1 })
  received!: number;

  @ApiProperty({ example: 1 })
  upserted!: number;

  @ApiProperty({ example: 0 })
  removed!: number;

  @ApiProperty({ example: 0 })
  unchanged!: number;

  @ApiProperty({ example: 0 })
  rejected!: number;
}

export class PushDailyUsageResultDto {
  @ApiProperty()
  clientDeviceId!: string;

  @ApiProperty({ example: '2026-07-09T12:00:00.000Z' })
  acceptedAt!: string;

  @ApiProperty({ example: 1 })
  clientRevision!: number;

  @ApiProperty({ type: SyncUsageWindowDto })
  window!: SyncUsageWindowDto;

  @ApiProperty({ type: PushDailyUsageCountsDto })
  counts!: PushDailyUsageCountsDto;
}

export class PushDailyUsageEnvelopeDto {
  @ApiProperty({ type: PushDailyUsageResultDto })
  data!: PushDailyUsageResultDto;
}

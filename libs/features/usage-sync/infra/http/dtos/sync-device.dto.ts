import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const PLATFORMS = ['linux', 'macos', 'windows'] as const;

export class UpsertSyncDeviceRequestDto {
  @ApiPropertyOptional({
    type: String,
    example: 'fikri-laptop',
    nullable: true,
    description: 'Optional human label (hostname or user-editable name).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string | null;

  @ApiProperty({ enum: PLATFORMS, example: 'linux' })
  @IsIn(PLATFORMS)
  platform!: (typeof PLATFORMS)[number];

  @ApiProperty({ type: String, example: '0.1.20' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  appVersion!: string;

  @ApiProperty({
    type: String,
    example: 'Asia/Jakarta',
    description: 'IANA reporting timezone from the desktop install.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  reportingTimezone!: string;
}

export class SyncDeviceDto {
  @ApiProperty({ type: String, example: 'dev_abc123' })
  clientDeviceId!: string;

  @ApiPropertyOptional({ type: String, example: 'fikri-laptop', nullable: true })
  displayName!: string | null;

  @ApiProperty({ enum: PLATFORMS, example: 'linux' })
  platform!: (typeof PLATFORMS)[number];

  @ApiProperty({ type: String, example: '0.1.20' })
  appVersion!: string;

  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  reportingTimezone!: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-07-09T12:00:00.000Z',
    nullable: true,
    description: 'Last successful daily-usage accept time, if any.',
  })
  lastSyncAt!: string | null;

  @ApiProperty({ type: String, example: '2026-07-09T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ type: String, example: '2026-07-09T10:00:00.000Z' })
  updatedAt!: string;
}

export class SyncDeviceEnvelopeDto {
  @ApiProperty({ type: SyncDeviceDto })
  data!: SyncDeviceDto;
}

/** Path param validation helpers (applied via DTO pipe if needed). */
export class SyncDeviceIdParamDto {
  @ApiProperty({ type: String, example: 'dev_abc123', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  clientDeviceId!: string;
}

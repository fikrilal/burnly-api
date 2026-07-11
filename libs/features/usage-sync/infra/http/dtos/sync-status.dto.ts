import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PLATFORMS = ['linux', 'macos', 'windows'] as const;

export class SyncStatusDeviceDto {
  @ApiProperty({ type: String, example: 'dev_abc123' })
  clientDeviceId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'fikri-laptop' })
  displayName!: string | null;

  @ApiProperty({ enum: PLATFORMS, example: 'linux' })
  platform!: (typeof PLATFORMS)[number];

  @ApiProperty({ type: String, example: '0.1.20' })
  appVersion!: string;

  @ApiProperty({ type: String, example: 'Asia/Jakarta' })
  reportingTimezone!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-07-15T03:55:00.000Z',
    description: 'Last successful daily-usage accept time, if any.',
  })
  lastSyncAt!: string | null;

  @ApiPropertyOptional({
    oneOf: [{ type: 'number' }, { type: 'string' }],
    nullable: true,
    example: 42,
    description: 'Last accepted push clientRevision on this device.',
  })
  lastClientRevision!: number | string | null;

  @ApiProperty({ type: String, example: '2026-07-01T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ type: String, example: '2026-07-15T03:55:00.000Z' })
  updatedAt!: string;
}

export class SyncStatusDataDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-07-15T03:55:00.000Z',
    description: 'MAX(device.lastSyncAt) across the account, or null if never synced.',
  })
  lastSyncAt!: string | null;

  @ApiProperty({ type: Number, example: 2 })
  deviceCount!: number;

  @ApiProperty({
    type: [SyncStatusDeviceDto],
    description: 'Ordered by lastSyncAt DESC NULLS LAST, then createdAt DESC.',
  })
  devices!: SyncStatusDeviceDto[];
}

export class SyncStatusEnvelopeDto {
  @ApiProperty({ type: SyncStatusDataDto })
  data!: SyncStatusDataDto;
}

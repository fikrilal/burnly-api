import { Body, Controller, Get, Param, Put, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { SyncDevicesService } from '../../app/sync-devices.service';
import { SyncErrorCode } from '../../app/usage-sync.error-codes';
import { UsageSyncError } from '../../app/usage-sync.errors';
import { SyncDeviceEnvelopeDto, UpsertSyncDeviceRequestDto } from './dtos/sync-device.dto';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

const CLIENT_DEVICE_ID_MAX = 128;

function assertClientDeviceId(clientDeviceId: string): string {
  const trimmed = clientDeviceId.trim();
  if (trimmed.length === 0 || trimmed.length > CLIENT_DEVICE_ID_MAX) {
    throw new UsageSyncError({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Invalid clientDeviceId',
      issues: [
        {
          field: 'clientDeviceId',
          message: `clientDeviceId must be 1–${CLIENT_DEVICE_ID_MAX} characters`,
        },
      ],
    });
  }
  return trimmed;
}

@ApiTags('Sync')
@Controller('sync/devices')
@UseFilters(UsageSyncErrorFilter)
export class SyncDevicesController {
  constructor(private readonly devices: SyncDevicesService) {}

  @Put(':clientDeviceId')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'sync.devices.upsert',
    summary: 'Register or update a sync device',
    description:
      'Upserts this desktop install as a sync device for the authenticated user. Safe to call repeatedly.',
  })
  @ApiParam({
    name: 'clientDeviceId',
    type: String,
    description: 'Stable per-install client device id (max 128 chars).',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: SyncDeviceEnvelopeDto })
  async upsertDevice(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('clientDeviceId') clientDeviceId: string,
    @Body() body: UpsertSyncDeviceRequestDto,
  ) {
    return this.devices.upsertDevice({
      userId: principal.userId,
      clientDeviceId: assertClientDeviceId(clientDeviceId),
      displayName: body.displayName,
      platform: body.platform,
      appVersion: body.appVersion,
      reportingTimezone: body.reportingTimezone,
    });
  }

  @Get(':clientDeviceId')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'sync.devices.get',
    summary: 'Get sync device metadata',
    description:
      'Returns this install’s sync device metadata for the authenticated user, including lastSyncAt when available.',
  })
  @ApiParam({
    name: 'clientDeviceId',
    type: String,
    description: 'Stable per-install client device id (max 128 chars).',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: SyncDeviceEnvelopeDto })
  async getDevice(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('clientDeviceId') clientDeviceId: string,
  ) {
    return this.devices.getDevice(principal.userId, assertClientDeviceId(clientDeviceId));
  }
}

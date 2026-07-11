import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { GetSyncStatusService } from '../../app/get-sync-status.service';
import { SyncStatusEnvelopeDto } from './dtos/sync-status.dto';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

@ApiTags('Sync')
@Controller('sync')
@UseFilters(UsageSyncErrorFilter)
export class SyncStatusController {
  constructor(private readonly status: GetSyncStatusService) {}

  @Get('status')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'sync.status.get',
    summary: 'Sync status and device inventory',
    description:
      'Returns registered sync devices for the authenticated user with last successful push times. ' +
      'Account lastSyncAt is MAX(device.lastSyncAt). Public identity is clientDeviceId (not server UUID). ' +
      'This is not a usage totals API.',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: SyncStatusEnvelopeDto })
  async getStatus(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.status.execute(principal.userId);
  }
}

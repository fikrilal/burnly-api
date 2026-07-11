import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { GetUsageModelsService } from '../../app/get-usage-models.service';
import { SyncErrorCode } from '../../app/usage-sync.error-codes';
import { UsageModelsEnvelopeDto, UsageModelsQueryDto } from './dtos/usage-models.dto';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

@ApiTags('Usage')
@Controller('usage')
@UseFilters(UsageSyncErrorFilter)
export class UsageModelsController {
  constructor(private readonly models: GetUsageModelsService) {}

  @Get('models')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'usage.models.list',
    summary: 'Model breakdown over a date range',
    description:
      'Aggregates daily model children by modelIdentityKey for the inclusive from/to range. ' +
      'parentTotals.totalTokens is the authoritative chart baseline; attribution.unattributedTokens ' +
      'covers remainder when children under-sum. Optional deviceId and sourceKey filters. ' +
      'Max range 366 days. Does not use model sums as period totals.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: UsageModelsEnvelopeDto })
  async listModels(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: UsageModelsQueryDto,
  ) {
    return this.models.execute({
      userId: principal.userId,
      timezone: query.timezone,
      from: query.from,
      to: query.to,
      deviceId: query.deviceId,
      sourceKey: query.sourceKey,
    });
  }
}

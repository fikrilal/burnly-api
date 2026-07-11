import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { GetUsageSourceModelsService } from '../../app/get-usage-source-models.service';
import { GetUsageSourcesService } from '../../app/get-usage-sources.service';
import { SyncErrorCode } from '../../app/usage-sync.error-codes';
import {
  UsageSourceModelsEnvelopeDto,
  UsageSourceModelsQueryDto,
  UsageSourcesEnvelopeDto,
  UsageSourcesQueryDto,
} from './dtos/usage-sources.dto';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

@ApiTags('Usage')
@Controller('usage')
@UseFilters(UsageSyncErrorFilter)
export class UsageSourcesController {
  constructor(
    private readonly sources: GetUsageSourcesService,
    private readonly sourceModels: GetUsageSourceModelsService,
  ) {}

  @Get('sources')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'usage.sources.list',
    summary: 'Usage by coding tool (source) over a date range',
    description:
      'Returns parent-based totalTokens grouped by product sourceKey (claude-code, codex, …) ' +
      'for the inclusive from/to window. Account parentTotals cover all tools. ' +
      'Multi-device sum by default; optional deviceId filter. Max range 366 days. ' +
      'Tool totals never sum model children.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: UsageSourcesEnvelopeDto })
  async listSources(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: UsageSourcesQueryDto,
  ) {
    return this.sources.execute({
      userId: principal.userId,
      timezone: query.timezone,
      from: query.from,
      to: query.to,
      deviceId: query.deviceId,
    });
  }

  @Get('sources/:sourceKey/models')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'usage.sources.models.list',
    summary: 'Model breakdown under one coding tool over a date range',
    description:
      'Aggregates daily model children for a single sourceKey. parentTotals are parent facts ' +
      'for that tool only; attribution.unattributedTokens is the remainder vs model sums. ' +
      'Unknown sourceKey returns 200 with zeros/empty models (not 404). Max range 366 days.',
  })
  @ApiParam({
    name: 'sourceKey',
    type: String,
    example: 'claude-code',
    description: 'Product source key (URL-encode if needed). Max 64 characters.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: UsageSourceModelsEnvelopeDto })
  async listSourceModels(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('sourceKey') sourceKey: string,
    @Query() query: UsageSourceModelsQueryDto,
  ) {
    return this.sourceModels.execute({
      userId: principal.userId,
      sourceKey,
      timezone: query.timezone,
      from: query.from,
      to: query.to,
      deviceId: query.deviceId,
    });
  }
}

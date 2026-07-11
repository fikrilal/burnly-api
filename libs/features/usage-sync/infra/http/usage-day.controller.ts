import { Controller, Get, Param, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { GetUsageDayService } from '../../app/get-usage-day.service';
import { SyncErrorCode } from '../../app/usage-sync.error-codes';
import { UsageDayEnvelopeDto, UsageDayQueryDto } from './dtos/usage-day.dto';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

@ApiTags('Usage')
@Controller('usage')
@UseFilters(UsageSyncErrorFilter)
export class UsageDayController {
  constructor(private readonly day: GetUsageDayService) {}

  @Get('days/:date')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'usage.days.get',
    summary: 'Usage day drill-down',
    description:
      'Returns active parent daily facts for a single calendar date with model children, ' +
      'day-level parent totals, bySource rollup, and modelAttribution unattributed remainder. ' +
      'Empty days return 200 with zeros and empty facts (not 404). ' +
      'Parent totalTokens are authoritative; never sum models for day totals.',
  })
  @ApiParam({
    name: 'date',
    type: String,
    example: '2026-07-08',
    description: 'Calendar date YYYY-MM-DD',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: UsageDayEnvelopeDto })
  async getDay(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('date') date: string,
    @Query() query: UsageDayQueryDto,
  ) {
    return this.day.execute({
      userId: principal.userId,
      date,
      timezone: query.timezone,
      deviceId: query.deviceId,
    });
  }
}

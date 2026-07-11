import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { GetUsageCalendarService } from '../../app/get-usage-calendar.service';
import { SyncErrorCode } from '../../app/usage-sync.error-codes';
import { UsageCalendarEnvelopeDto, UsageCalendarQueryDto } from './dtos/usage-calendar.dto';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

@ApiTags('Usage')
@Controller('usage')
@UseFilters(UsageSyncErrorFilter)
export class UsageCalendarController {
  constructor(private readonly calendar: GetUsageCalendarService) {}

  @Get('calendar')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'usage.calendar.get',
    summary: 'Usage calendar heatmap series',
    description:
      'Returns a dense per-day series of parent totalTokens for the inclusive from/to range ' +
      'in the given IANA timezone (exact aggregationTimezone match). Empty days are zeros. ' +
      'Sums across devices by default; optional deviceId filters to one clientDeviceId. ' +
      'Max range 366 days inclusive. Does not include model children.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: UsageCalendarEnvelopeDto })
  async getCalendar(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: UsageCalendarQueryDto,
  ) {
    return this.calendar.execute({
      userId: principal.userId,
      timezone: query.timezone,
      from: query.from,
      to: query.to,
      deviceId: query.deviceId,
    });
  }
}

import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { GetUsageSummaryService } from '../../app/get-usage-summary.service';
import { SyncErrorCode } from '../../app/usage-sync.error-codes';
import { UsageSummaryEnvelopeDto, UsageSummaryQueryDto } from './dtos/usage-summary.dto';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

@ApiTags('Usage')
@Controller('usage')
@UseFilters(UsageSyncErrorFilter)
export class UsageSummaryController {
  constructor(private readonly summary: GetUsageSummaryService) {}

  @Get('summary')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'usage.summary.get',
    summary: 'Usage summary for today / week / month',
    description:
      'Returns user-level parent token totals for today, the last 7 calendar days (including today), ' +
      'and the current calendar month in the given IANA timezone. Sums active DailyUsageFact rows ' +
      'across devices by default. Optional deviceId filters to one clientDeviceId. ' +
      'Parent totalTokens are authoritative; model children are not used.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: UsageSummaryEnvelopeDto })
  async getSummary(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: UsageSummaryQueryDto,
  ) {
    return this.summary.execute({
      userId: principal.userId,
      timezone: query.timezone,
      deviceId: query.deviceId,
    });
  }
}

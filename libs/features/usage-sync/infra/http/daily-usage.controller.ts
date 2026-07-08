import { Body, Controller, HttpCode, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { PushDailyUsageService } from '../../app/push-daily-usage.service';
import { SyncErrorCode } from '../../app/usage-sync.error-codes';
import {
  PushDailyUsageEnvelopeDto,
  PushDailyUsageRequestDto,
} from './dtos/push-daily-usage.dto';
import { RedisDailyUsagePushRateLimiter } from '../rate-limit/redis-daily-usage-push-rate-limiter';
import { UsageSyncErrorFilter } from './usage-sync-error.filter';

@ApiTags('Sync')
@Controller('sync')
@UseFilters(UsageSyncErrorFilter)
export class DailyUsageController {
  constructor(
    private readonly pushService: PushDailyUsageService,
    private readonly pushRateLimiter: RedisDailyUsagePushRateLimiter,
  ) {}

  @Post('daily-usage')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'sync.dailyUsage.push',
    summary: 'Push daily usage facts',
    description:
      'Uploads a batch of daily usage aggregates for a registered sync device. Requires Idempotency-Key. All-or-nothing validation; does not create devices. Limits: 1000 facts/request, 100 models/fact, 60 pushes/15 min per user.',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RATE_LIMITED,
    SyncErrorCode.SYNC_CONTRACT_UNSUPPORTED,
    SyncErrorCode.SYNC_DEVICE_NOT_FOUND,
    SyncErrorCode.SYNC_IDENTITY_INVALID,
    SyncErrorCode.SYNC_PAYLOAD_TOO_LARGE,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: PushDailyUsageEnvelopeDto })
  @ApiIdempotencyKeyHeader({ required: true })
  @Idempotent({ required: true, scopeKey: 'sync.dailyUsage.push' })
  async push(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: PushDailyUsageRequestDto,
    @Req() req: FastifyRequest,
  ) {
    await this.pushRateLimiter.assertAllowed({ userId: principal.userId });

    const idempotencyKeyHeader = req.headers['idempotency-key'];
    const clientBatchId =
      typeof idempotencyKeyHeader === 'string'
        ? idempotencyKeyHeader
        : Array.isArray(idempotencyKeyHeader)
          ? idempotencyKeyHeader[0]
          : null;

    const requestIdHeader = req.headers['x-request-id'];
    const traceId =
      typeof requestIdHeader === 'string'
        ? requestIdHeader
        : Array.isArray(requestIdHeader)
          ? requestIdHeader[0]
          : null;

    return this.pushService.push({
      userId: principal.userId,
      contractVersion: body.contractVersion,
      clientDeviceId: body.clientDeviceId,
      appVersion: body.appVersion,
      reportingTimezone: body.reportingTimezone,
      clientRevision: body.clientRevision,
      window: body.window,
      facts: body.facts,
      clientBatchId: clientBatchId ?? null,
      traceId: traceId ?? null,
    });
  }
}

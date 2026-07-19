import { Controller, Get, Query, Req, UseFilters } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import {
  AccessTokenInvalidError,
  AccessTokenVerifier,
} from '../../../../platform/auth/access-token-verifier.service';
import { Public } from '../../../../platform/auth/public.decorator';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { GetLeaderboardService } from '../../app/get-leaderboard.service';
import { LeaderboardEnvelopeDto, LeaderboardQueryDto } from './dtos/leaderboard.dto';
import { LeaderboardErrorFilter } from './leaderboard-error.filter';
import { RedisLeaderboardListRateLimiter } from '../rate-limit/redis-leaderboard-list-rate-limiter';

function getAuthorizationHeader(req: FastifyRequest): string | undefined {
  const raw = req.headers['authorization'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const trimmed = authorization.trim();
  if (!trimmed) return undefined;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return token.trim() || undefined;
}

function clientIp(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    const first = forwarded.split(',')[0];
    if (first && first.trim() !== '') return first.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].trim();
  }
  return req.ip || 'unknown';
}

@ApiTags('Leaderboard')
@Controller('leaderboard')
@UseFilters(LeaderboardErrorFilter)
export class LeaderboardController {
  constructor(
    private readonly leaderboard: GetLeaderboardService,
    private readonly rateLimiter: RedisLeaderboardListRateLimiter,
    private readonly tokenVerifier: AccessTokenVerifier,
  ) {}

  @Get()
  @Public()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'leaderboard.list',
    summary: 'Public global leaderboard',
    description:
      'Returns a public ranking of users who opted in to the leaderboard, ordered by ' +
      'summed parent daily totalTokens over a UTC window (7d, 30d, or all-time). ' +
      'Authentication is optional: a valid Bearer token adds a viewer block; invalid ' +
      'tokens are ignored (anonymous). Only opted-in users with score > 0 appear. ' +
      'See ADR 0023.',
  })
  @ApiErrorCodes([ErrorCode.VALIDATION_FAILED, ErrorCode.RATE_LIMITED, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: LeaderboardEnvelopeDto })
  async list(@Query() query: LeaderboardQueryDto, @Req() req: FastifyRequest) {
    await this.rateLimiter.assertAllowed({ ip: clientIp(req) });

    const viewerUserId = await this.tryViewerUserId(req);

    const result = await this.leaderboard.execute({
      window: query.window,
      metric: query.metric,
      limit: query.limit,
      cursor: query.cursor,
      ...(viewerUserId ? { viewerUserId } : {}),
    });

    const { nextCursor, ...data } = result;
    return {
      data,
      meta: { nextCursor },
    };
  }

  private async tryViewerUserId(req: FastifyRequest): Promise<string | undefined> {
    const token = extractBearerToken(getAuthorizationHeader(req));
    if (!token) return undefined;
    try {
      const principal = await this.tokenVerifier.verifyAccessToken(token);
      return principal.userId;
    } catch (err: unknown) {
      if (err instanceof AccessTokenInvalidError) {
        return undefined;
      }
      // Unexpected verifier failures: treat as anonymous rather than fail public list.
      return undefined;
    }
  }
}

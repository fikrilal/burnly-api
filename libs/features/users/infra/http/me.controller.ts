import { Body, Controller, Get, Patch, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../../app/users.service';
import { AccessTokenGuard } from '../../../../platform/auth/access-token.guard';
import { CurrentPrincipal } from '../../../../platform/auth/current-principal.decorator';
import type { AuthPrincipal } from '../../../../platform/auth/auth.types';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { Idempotent } from '../../../../platform/http/idempotency/idempotency.decorator';
import { ApiIdempotencyKeyHeader } from '../../../../platform/http/openapi/api-idempotency-key.decorator';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import type { UpdateMePatch } from '../../app/users.types';
import { MeEnvelopeDto, PatchMeRequestDto } from './dtos/me.dto';
import { UsersErrorFilter } from './users-error.filter';

@ApiTags('Users')
@Controller()
@UseFilters(UsersErrorFilter)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.get',
    summary: 'Get current user',
    description:
      'Returns the authenticated user profile, including leaderboard opt-in settings (default off).',
  })
  @ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: MeEnvelopeDto })
  async getMe(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.users.getMe(principal.userId);
  }

  @Patch('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    operationId: 'users.me.patch',
    summary: 'Update current user profile and/or leaderboard settings',
    description:
      'Partially updates the authenticated user. Provide `profile` and/or `leaderboard`. ' +
      'Omitted sections are unchanged. Profile fields: omitted keys unchanged; null clears a field. ' +
      'Leaderboard opt-out removes the user from public ranks on subsequent reads (ADR 0023).',
  })
  @ApiErrorCodes([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_IN_PROGRESS,
    ErrorCode.CONFLICT,
    ErrorCode.INTERNAL,
  ])
  @ApiOkResponse({ type: MeEnvelopeDto })
  @ApiIdempotencyKeyHeader({ required: false })
  @Idempotent({ scopeKey: 'users.me.patch' })
  async patchMe(@CurrentPrincipal() principal: AuthPrincipal, @Body() body: PatchMeRequestDto) {
    const patch: UpdateMePatch = {
      ...(body.profile !== undefined ? { profile: body.profile } : {}),
      ...(body.leaderboard !== undefined ? { leaderboard: { optIn: body.leaderboard.optIn } } : {}),
    };
    return this.users.updateMe(principal.userId, patch);
  }
}

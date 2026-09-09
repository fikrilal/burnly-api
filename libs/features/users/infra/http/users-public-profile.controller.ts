import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProblemException } from '../../../../platform/http/errors/problem.exception';
import { UserNotFoundError } from '../../app/users.errors';
import { UsersService } from '../../app/users.service';
import { Public } from '../../../../platform/auth/public.decorator';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { ApiErrorCodes } from '../../../../platform/http/openapi/api-error-codes.decorator';
import { PublicProfileEnvelopeDto } from './dtos/public-profile.dto';
import { bigintToJsonNumber } from '../../../../shared/json-bigint';

@ApiTags('Users')
@Controller('users')
export class UsersPublicProfileController {
  constructor(private readonly users: UsersService) {}

  @Get('by-username/:username')
  @Public()
  @ApiOperation({
    operationId: 'users.publicProfile.getByUsername',
    summary: 'Get public profile by username handle',
    description:
      'Returns the public profile and usage statistics for an opted-in user. ' +
      'Returns 404 Not Found if the user does not exist or is opted out of the public leaderboard.',
  })
  @ApiErrorCodes([ErrorCode.NOT_FOUND, ErrorCode.INTERNAL])
  @ApiOkResponse({ type: PublicProfileEnvelopeDto })
  async getByUsername(@Param('username') username: string) {
    try {
      const profile = await this.users.getPublicProfileByUsername(username);
      return {
        id: profile.id,
        displayName: profile.displayName,
        username: profile.username,
        githubUrl: profile.githubUrl,
        websiteUrl: profile.websiteUrl,
        joinedAt: profile.joinedAt,
        totalTokens: bigintToJsonNumber(profile.totalTokens),
        topTools: profile.topTools.map((t) => ({
          sourceKey: t.sourceKey,
          totalTokens: bigintToJsonNumber(t.totalTokens),
        })),
        topModels: profile.topModels.map((m) => ({
          modelIdentityKey: m.modelIdentityKey,
          displayName: m.displayName,
          totalTokens: bigintToJsonNumber(m.totalTokens),
        })),
        activityCalendar: profile.activityCalendar.map((c) => ({
          date: c.date,
          totalTokens: bigintToJsonNumber(c.totalTokens),
        })),
      };
    } catch (err: unknown) {
      if (
        err instanceof UserNotFoundError ||
        (err instanceof Error && err.name === 'UserNotFoundError')
      ) {
        throw ProblemException.notFound('User not found or profile is not public');
      }
      throw err;
    }
  }
}

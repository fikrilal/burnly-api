import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { provideConstructedClockedAppService } from '../../../platform/di/app-service.provider';
import { RedisModule } from '../../../platform/redis/redis.module';
import { GetLeaderboardService } from '../app/get-leaderboard.service';
import { LeaderboardController } from './http/leaderboard.controller';
import { PrismaLeaderboardRepository } from './persistence/prisma-leaderboard.repository';
import { RedisLeaderboardListRateLimiter } from './rate-limit/redis-leaderboard-list-rate-limiter';

/**
 * Public leaderboard feature (ADR 0023).
 * Opt-in settings live on users (`GET/PATCH /v1/me`); ranks read usage facts.
 */
@Module({
  imports: [PrismaModule, PlatformAuthModule, RedisModule],
  controllers: [LeaderboardController],
  providers: [
    PrismaLeaderboardRepository,
    RedisLeaderboardListRateLimiter,
    provideConstructedClockedAppService({
      provide: GetLeaderboardService,
      inject: [PrismaLeaderboardRepository],
      useClass: GetLeaderboardService,
    }),
  ],
  exports: [GetLeaderboardService],
})
export class LeaderboardModule {}

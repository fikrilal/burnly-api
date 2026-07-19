import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import {
  LEADERBOARD_IP_BLOCK_SECONDS,
  LEADERBOARD_IP_MAX_ATTEMPTS,
  LEADERBOARD_IP_WINDOW_SECONDS,
} from '../../app/leaderboard.limits';
import { LeaderboardError } from '../../app/leaderboard.errors';

type RateLimitConfig = Readonly<{
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
}>;

async function getRetryAfterSeconds(
  client: ReturnType<RedisService['getClient']>,
  key: string,
  fallbackSeconds: number,
): Promise<number> {
  const ttl = await client.ttl(key);
  if (ttl > 0) return ttl;
  if (ttl === 0) return 1;
  return fallbackSeconds;
}

/**
 * Per-IP rate limit for public GET /v1/leaderboard.
 * 60 requests / 60 seconds, then block 60 seconds.
 */
@Injectable()
export class RedisLeaderboardListRateLimiter {
  private readonly config: RateLimitConfig = {
    maxAttempts: LEADERBOARD_IP_MAX_ATTEMPTS,
    windowSeconds: LEADERBOARD_IP_WINDOW_SECONDS,
    blockSeconds: LEADERBOARD_IP_BLOCK_SECONDS,
  };

  constructor(private readonly redis: RedisService) {}

  async assertAllowed(ctx: { ip: string }): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();
    const ip = ctx.ip.trim() || 'unknown';
    const countKey = `leaderboard:list:ip:${ip}:requests`;
    const blockKey = `leaderboard:list:ip:${ip}:blocked`;

    const blocked = await client.get(blockKey);
    if (blocked) {
      const retryAfterSeconds = await getRetryAfterSeconds(
        client,
        blockKey,
        this.config.blockSeconds,
      );
      throw this.rateLimited(retryAfterSeconds);
    }

    const count = await client.incr(countKey);
    if (count === 1) {
      await client.expire(countKey, this.config.windowSeconds);
    }

    if (count > this.config.maxAttempts) {
      await client.set(blockKey, '1', 'EX', this.config.blockSeconds);
      const retryAfterSeconds = await getRetryAfterSeconds(
        client,
        blockKey,
        this.config.blockSeconds,
      );
      throw this.rateLimited(retryAfterSeconds);
    }
  }

  private rateLimited(retryAfterSeconds: number): LeaderboardError {
    return new LeaderboardError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many leaderboard requests. Try again later.',
      retryAfterSeconds,
    });
  }
}

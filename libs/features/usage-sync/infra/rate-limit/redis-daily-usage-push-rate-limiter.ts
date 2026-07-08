import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import {
  DAILY_USAGE_PUSH_USER_BLOCK_SECONDS,
  DAILY_USAGE_PUSH_USER_MAX_ATTEMPTS,
  DAILY_USAGE_PUSH_USER_WINDOW_SECONDS,
} from '../../app/usage-sync.limits';
import { UsageSyncError } from '../../app/usage-sync.errors';

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
 * Per-user rate limit for POST /v1/sync/daily-usage.
 * 60 attempts / 15 minutes (then block 15 minutes).
 */
@Injectable()
export class RedisDailyUsagePushRateLimiter {
  private readonly userConfig: RateLimitConfig = {
    maxAttempts: DAILY_USAGE_PUSH_USER_MAX_ATTEMPTS,
    windowSeconds: DAILY_USAGE_PUSH_USER_WINDOW_SECONDS,
    blockSeconds: DAILY_USAGE_PUSH_USER_BLOCK_SECONDS,
  };

  constructor(private readonly redis: RedisService) {}

  async assertAllowed(ctx: { userId: string }): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();
    const userCountKey = `sync:daily-usage:push:user:${ctx.userId}:requests`;
    const userBlockKey = `sync:daily-usage:push:user:${ctx.userId}:blocked`;

    const userBlocked = await client.get(userBlockKey);
    if (userBlocked) {
      const retryAfterSeconds = await getRetryAfterSeconds(
        client,
        userBlockKey,
        this.userConfig.blockSeconds,
      );
      throw this.rateLimited(retryAfterSeconds);
    }

    const count = await client.incr(userCountKey);
    if (count === 1) {
      await client.expire(userCountKey, this.userConfig.windowSeconds);
    }

    if (count > this.userConfig.maxAttempts) {
      await client.set(userBlockKey, '1', 'EX', this.userConfig.blockSeconds);
      const retryAfterSeconds = await getRetryAfterSeconds(
        client,
        userBlockKey,
        this.userConfig.blockSeconds,
      );
      throw this.rateLimited(retryAfterSeconds);
    }
  }

  private rateLimited(retryAfterSeconds: number): UsageSyncError {
    return new UsageSyncError({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many daily-usage push requests. Try again later.',
      retryAfterSeconds,
    });
  }
}

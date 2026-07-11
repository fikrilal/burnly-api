import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthError } from '../../app/auth.errors';
import type {
  DesktopHandoffRateLimitContext,
  DesktopHandoffRateLimiter,
} from '../../app/ports/desktop-handoff-rate-limiter';
import { RedisService } from '../../../../platform/redis/redis.service';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import {
  applyIpRateLimit,
  asNonEmptyString,
  asPositiveInt,
  getRetryAfterSeconds,
  hashKey,
  type IpRateLimitConfig,
} from './rate-limit.utils';

@Injectable()
export class RedisDesktopHandoffRateLimiter implements DesktopHandoffRateLimiter {
  private readonly ipConfig: IpRateLimitConfig;
  private readonly userConfig: IpRateLimitConfig;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.ipConfig = {
      maxAttempts: asPositiveInt(this.config.get('AUTH_DESKTOP_HANDOFF_IP_MAX_ATTEMPTS'), 30),
      windowSeconds: asPositiveInt(
        this.config.get('AUTH_DESKTOP_HANDOFF_IP_WINDOW_SECONDS'),
        5 * 60,
      ),
      blockSeconds: asPositiveInt(
        this.config.get('AUTH_DESKTOP_HANDOFF_IP_BLOCK_SECONDS'),
        15 * 60,
      ),
    };
    this.userConfig = {
      maxAttempts: asPositiveInt(this.config.get('AUTH_DESKTOP_HANDOFF_USER_MAX_ATTEMPTS'), 20),
      windowSeconds: asPositiveInt(
        this.config.get('AUTH_DESKTOP_HANDOFF_USER_WINDOW_SECONDS'),
        5 * 60,
      ),
      blockSeconds: asPositiveInt(
        this.config.get('AUTH_DESKTOP_HANDOFF_USER_BLOCK_SECONDS'),
        15 * 60,
      ),
    };
  }

  async assertAllowed(ctx: DesktopHandoffRateLimitContext): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();
    let retryAfterSeconds = 0;

    const ip = asNonEmptyString(ctx.ip);
    if (ip) {
      const retry = await applyIpRateLimit({
        client,
        ip,
        keyPrefix: 'auth:desktop-handoff:ip',
        config: this.ipConfig,
      });
      if (retry !== undefined) {
        retryAfterSeconds = Math.max(retryAfterSeconds, retry);
      }
    }

    const userId = asNonEmptyString(ctx.userId);
    if (userId) {
      const userHash = hashKey(userId);
      const countKey = `auth:desktop-handoff:user:${userHash}:requests`;
      const blockKey = `auth:desktop-handoff:user:${userHash}:blocked`;

      const blocked = await client.get(blockKey);
      if (blocked) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          await getRetryAfterSeconds(client, blockKey, this.userConfig.blockSeconds),
        );
      } else {
        const count = await client.incr(countKey);
        if (count === 1) {
          await client.expire(countKey, this.userConfig.windowSeconds);
        }
        if (count >= this.userConfig.maxAttempts) {
          await client.set(blockKey, '1', 'EX', this.userConfig.blockSeconds);
          retryAfterSeconds = Math.max(retryAfterSeconds, this.userConfig.blockSeconds);
        }
      }
    }

    if (retryAfterSeconds > 0) {
      throw new AuthError({
        status: 429,
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many desktop handoff attempts. Try again later.',
        retryAfterSeconds,
      });
    }
  }
}

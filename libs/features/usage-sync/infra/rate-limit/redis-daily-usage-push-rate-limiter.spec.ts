import { ErrorCode } from '../../../../platform/http/errors/error-codes';
import { RedisService } from '../../../../platform/redis/redis.service';
import { createPrototypeStub } from '../../../../../test/support/stubs';
import { RedisDailyUsagePushRateLimiter } from './redis-daily-usage-push-rate-limiter';

describe('RedisDailyUsagePushRateLimiter', () => {
  it('no-ops when redis is disabled', async () => {
    const redis = createPrototypeStub(RedisService, {
      isEnabled: () => false,
      getClient: jest.fn(),
    });
    const limiter = new RedisDailyUsagePushRateLimiter(redis);
    await expect(limiter.assertAllowed({ userId: 'u1' })).resolves.toBeUndefined();
    expect(redis.getClient).not.toHaveBeenCalled();
  });

  it('throws RATE_LIMITED when blocked', async () => {
    const client = {
      get: jest.fn(async () => '1'),
      ttl: jest.fn(async () => 42),
      incr: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
    };
    const redis = createPrototypeStub(RedisService, {
      isEnabled: () => true,
      getClient: () => client,
    });
    const limiter = new RedisDailyUsagePushRateLimiter(redis);

    await expect(limiter.assertAllowed({ userId: 'u1' })).rejects.toMatchObject({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
      retryAfterSeconds: 42,
    });
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('blocks after max attempts', async () => {
    const client = {
      get: jest.fn(async () => null),
      ttl: jest.fn(async () => 100),
      incr: jest.fn(async () => 61),
      expire: jest.fn(),
      set: jest.fn(async () => 'OK'),
    };
    const redis = createPrototypeStub(RedisService, {
      isEnabled: () => true,
      getClient: () => client,
    });
    const limiter = new RedisDailyUsagePushRateLimiter(redis);

    await expect(limiter.assertAllowed({ userId: 'u1' })).rejects.toMatchObject({
      status: 429,
      code: ErrorCode.RATE_LIMITED,
    });
    expect(client.set).toHaveBeenCalled();
  });
});

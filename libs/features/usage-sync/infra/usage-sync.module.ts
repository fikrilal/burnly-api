import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PrismaModule } from '../../../platform/db/prisma.module';
import {
  provideConstructedAppService,
  provideConstructedClockedAppService,
} from '../../../platform/di/app-service.provider';
import { RedisModule } from '../../../platform/redis/redis.module';
import { PushDailyUsageService } from '../app/push-daily-usage.service';
import { SyncDevicesService } from '../app/sync-devices.service';
import { DailyUsageController } from './http/daily-usage.controller';
import { SyncDevicesController } from './http/sync-devices.controller';
import { PrismaDailyUsageFactsRepository } from './persistence/prisma-daily-usage-facts.repository';
import { PrismaSyncBatchesRepository } from './persistence/prisma-sync-batches.repository';
import { PrismaSyncDevicesRepository } from './persistence/prisma-sync-devices.repository';
import { RedisDailyUsagePushRateLimiter } from './rate-limit/redis-daily-usage-push-rate-limiter';

/**
 * Usage-sync collect feature: device register/get + daily usage push.
 */
@Module({
  imports: [PrismaModule, PlatformAuthModule, RedisModule],
  controllers: [SyncDevicesController, DailyUsageController],
  providers: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
    RedisDailyUsagePushRateLimiter,
    provideConstructedAppService({
      provide: SyncDevicesService,
      inject: [PrismaSyncDevicesRepository],
      useClass: SyncDevicesService,
    }),
    provideConstructedClockedAppService({
      provide: PushDailyUsageService,
      inject: [PrismaSyncDevicesRepository, PrismaDailyUsageFactsRepository],
      useClass: PushDailyUsageService,
    }),
  ],
  exports: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
    SyncDevicesService,
    PushDailyUsageService,
  ],
})
export class UsageSyncModule {}

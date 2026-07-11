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
import { PrismaUsageReadRepository } from './persistence/prisma-usage-read.repository';
import { RedisDailyUsagePushRateLimiter } from './rate-limit/redis-daily-usage-push-rate-limiter';

/**
 * Usage-sync feature: collect write path + Phase 2 read foundation (no usage GET routes yet).
 */
@Module({
  imports: [PrismaModule, PlatformAuthModule, RedisModule],
  controllers: [SyncDevicesController, DailyUsageController],
  providers: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
    PrismaUsageReadRepository,
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
    PrismaUsageReadRepository,
    SyncDevicesService,
    PushDailyUsageService,
  ],
})
export class UsageSyncModule {}

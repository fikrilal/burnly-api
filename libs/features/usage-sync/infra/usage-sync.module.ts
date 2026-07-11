import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PrismaModule } from '../../../platform/db/prisma.module';
import {
  provideConstructedAppService,
  provideConstructedClockedAppService,
} from '../../../platform/di/app-service.provider';
import { RedisModule } from '../../../platform/redis/redis.module';
import { GetUsageCalendarService } from '../app/get-usage-calendar.service';
import { GetUsageSummaryService } from '../app/get-usage-summary.service';
import { PushDailyUsageService } from '../app/push-daily-usage.service';
import { SyncDevicesService } from '../app/sync-devices.service';
import { DailyUsageController } from './http/daily-usage.controller';
import { SyncDevicesController } from './http/sync-devices.controller';
import { UsageCalendarController } from './http/usage-calendar.controller';
import { UsageSummaryController } from './http/usage-summary.controller';
import { PrismaDailyUsageFactsRepository } from './persistence/prisma-daily-usage-facts.repository';
import { PrismaSyncBatchesRepository } from './persistence/prisma-sync-batches.repository';
import { PrismaSyncDevicesRepository } from './persistence/prisma-sync-devices.repository';
import { PrismaUsageReadRepository } from './persistence/prisma-usage-read.repository';
import { RedisDailyUsagePushRateLimiter } from './rate-limit/redis-daily-usage-push-rate-limiter';

/**
 * Usage-sync feature: collect write path + Phase 2 usage read APIs.
 */
@Module({
  imports: [PrismaModule, PlatformAuthModule, RedisModule],
  controllers: [
    SyncDevicesController,
    DailyUsageController,
    UsageSummaryController,
    UsageCalendarController,
  ],
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
    provideConstructedClockedAppService({
      provide: GetUsageSummaryService,
      inject: [PrismaUsageReadRepository, PrismaSyncDevicesRepository],
      useClass: GetUsageSummaryService,
    }),
    provideConstructedAppService({
      provide: GetUsageCalendarService,
      inject: [PrismaUsageReadRepository, PrismaSyncDevicesRepository],
      useClass: GetUsageCalendarService,
    }),
  ],
  exports: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
    PrismaUsageReadRepository,
    SyncDevicesService,
    PushDailyUsageService,
    GetUsageSummaryService,
    GetUsageCalendarService,
  ],
})
export class UsageSyncModule {}

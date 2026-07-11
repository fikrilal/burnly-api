import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PrismaModule } from '../../../platform/db/prisma.module';
import {
  provideConstructedAppService,
  provideConstructedClockedAppService,
} from '../../../platform/di/app-service.provider';
import { RedisModule } from '../../../platform/redis/redis.module';
import { GetSyncStatusService } from '../app/get-sync-status.service';
import { GetUsageCalendarService } from '../app/get-usage-calendar.service';
import { GetUsageDayService } from '../app/get-usage-day.service';
import { GetUsageModelsService } from '../app/get-usage-models.service';
import { GetUsageSourceModelsService } from '../app/get-usage-source-models.service';
import { GetUsageSourcesService } from '../app/get-usage-sources.service';
import { GetUsageSummaryService } from '../app/get-usage-summary.service';
import { PushDailyUsageService } from '../app/push-daily-usage.service';
import { SyncDevicesService } from '../app/sync-devices.service';
import { DailyUsageController } from './http/daily-usage.controller';
import { SyncDevicesController } from './http/sync-devices.controller';
import { SyncStatusController } from './http/sync-status.controller';
import { UsageCalendarController } from './http/usage-calendar.controller';
import { UsageDayController } from './http/usage-day.controller';
import { UsageModelsController } from './http/usage-models.controller';
import { UsageSourcesController } from './http/usage-sources.controller';
import { UsageSummaryController } from './http/usage-summary.controller';
import { PrismaDailyUsageFactsRepository } from './persistence/prisma-daily-usage-facts.repository';
import { PrismaSyncBatchesRepository } from './persistence/prisma-sync-batches.repository';
import { PrismaSyncDevicesRepository } from './persistence/prisma-sync-devices.repository';
import { PrismaUsageReadRepository } from './persistence/prisma-usage-read.repository';
import { RedisDailyUsagePushRateLimiter } from './rate-limit/redis-daily-usage-push-rate-limiter';

/**
 * Usage-sync feature: collect write path + Phase 2 usage/sync read APIs.
 */
@Module({
  imports: [PrismaModule, PlatformAuthModule, RedisModule],
  controllers: [
    SyncDevicesController,
    DailyUsageController,
    SyncStatusController,
    UsageSummaryController,
    UsageCalendarController,
    UsageDayController,
    UsageModelsController,
    UsageSourcesController,
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
    provideConstructedAppService({
      provide: GetSyncStatusService,
      inject: [PrismaSyncDevicesRepository],
      useClass: GetSyncStatusService,
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
    provideConstructedAppService({
      provide: GetUsageDayService,
      inject: [PrismaUsageReadRepository, PrismaSyncDevicesRepository],
      useClass: GetUsageDayService,
    }),
    provideConstructedAppService({
      provide: GetUsageModelsService,
      inject: [PrismaUsageReadRepository, PrismaSyncDevicesRepository],
      useClass: GetUsageModelsService,
    }),
    provideConstructedAppService({
      provide: GetUsageSourcesService,
      inject: [PrismaUsageReadRepository, PrismaSyncDevicesRepository],
      useClass: GetUsageSourcesService,
    }),
    provideConstructedAppService({
      provide: GetUsageSourceModelsService,
      inject: [PrismaUsageReadRepository, PrismaSyncDevicesRepository],
      useClass: GetUsageSourceModelsService,
    }),
  ],
  exports: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
    PrismaUsageReadRepository,
    SyncDevicesService,
    PushDailyUsageService,
    GetSyncStatusService,
    GetUsageSummaryService,
    GetUsageCalendarService,
    GetUsageDayService,
    GetUsageModelsService,
    GetUsageSourcesService,
    GetUsageSourceModelsService,
  ],
})
export class UsageSyncModule {}

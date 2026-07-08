import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../../platform/auth/auth.module';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { provideConstructedAppService } from '../../../platform/di/app-service.provider';
import { SyncDevicesService } from '../app/sync-devices.service';
import { SyncDevicesController } from './http/sync-devices.controller';
import { PrismaDailyUsageFactsRepository } from './persistence/prisma-daily-usage-facts.repository';
import { PrismaSyncBatchesRepository } from './persistence/prisma-sync-batches.repository';
import { PrismaSyncDevicesRepository } from './persistence/prisma-sync-devices.repository';

/**
 * Usage-sync collect feature.
 * Phase C.1: device register/get. Daily-usage push arrives in Phase C.2.
 */
@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [SyncDevicesController],
  providers: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
    provideConstructedAppService({
      provide: SyncDevicesService,
      inject: [PrismaSyncDevicesRepository],
      useClass: SyncDevicesService,
    }),
  ],
  exports: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
    SyncDevicesService,
  ],
})
export class UsageSyncModule {}

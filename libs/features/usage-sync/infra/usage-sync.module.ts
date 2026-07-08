import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../platform/db/prisma.module';
import { PrismaDailyUsageFactsRepository } from './persistence/prisma-daily-usage-facts.repository';
import { PrismaSyncBatchesRepository } from './persistence/prisma-sync-batches.repository';
import { PrismaSyncDevicesRepository } from './persistence/prisma-sync-devices.repository';

/**
 * Persistence adapters for usage-sync collect.
 * HTTP controllers and use-case services are wired in Phase C.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
  ],
  exports: [
    PrismaSyncDevicesRepository,
    PrismaDailyUsageFactsRepository,
    PrismaSyncBatchesRepository,
  ],
})
export class UsageSyncModule {}

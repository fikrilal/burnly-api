import { Injectable } from '@nestjs/common';
import type { SyncBatch } from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import type { SyncBatchesRepository } from '../../app/ports/sync-batches.repository';
import type { CreateSyncBatchInput, SyncBatchRecord } from '../../app/usage-sync.types';

function toRecord(row: SyncBatch): SyncBatchRecord {
  return {
    id: row.id,
    userId: row.userId,
    deviceId: row.deviceId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaSyncBatchesRepository implements SyncBatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSyncBatchInput): Promise<SyncBatchRecord> {
    const client = this.prisma.getClient();
    const row = await client.syncBatch.create({
      data: {
        userId: input.userId,
        deviceId: input.deviceId ?? null,
        clientBatchId: input.clientBatchId ?? null,
        contractVersion: input.contractVersion ?? null,
        clientRevision: input.clientRevision ?? null,
        appVersion: input.appVersion ?? null,
        windowStartDate: input.windowStartDate ?? null,
        windowEndDate: input.windowEndDate ?? null,
        windowScope: input.windowScope ?? null,
        status: input.status,
        recordsReceived: input.recordsReceived ?? 0,
        recordsUpserted: input.recordsUpserted ?? 0,
        recordsRemoved: input.recordsRemoved ?? 0,
        recordsUnchanged: input.recordsUnchanged ?? 0,
        rejectCode: input.rejectCode ?? null,
        traceId: input.traceId ?? null,
      },
    });
    return toRecord(row);
  }
}

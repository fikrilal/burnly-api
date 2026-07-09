import { Injectable } from '@nestjs/common';
import type { SyncDevice } from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import type { SyncDevicesRepository } from '../../app/ports/sync-devices.repository';
import type { SyncDeviceRecord, UpsertSyncDeviceInput } from '../../app/usage-sync.types';

function toRecord(row: SyncDevice): SyncDeviceRecord {
  return {
    id: row.id,
    userId: row.userId,
    clientDeviceId: row.clientDeviceId,
    displayName: row.displayName,
    platform: row.platform,
    appVersion: row.appVersion,
    reportingTimezone: row.reportingTimezone,
    lastSyncAt: row.lastSyncAt,
    lastClientRevision: row.lastClientRevision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaSyncDevicesRepository implements SyncDevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertByClientDeviceId(input: UpsertSyncDeviceInput): Promise<SyncDeviceRecord> {
    const client = this.prisma.getClient();
    const displayName = input.displayName === undefined ? undefined : (input.displayName ?? null);

    const row = await client.syncDevice.upsert({
      where: {
        userId_clientDeviceId: {
          userId: input.userId,
          clientDeviceId: input.clientDeviceId,
        },
      },
      create: {
        userId: input.userId,
        clientDeviceId: input.clientDeviceId,
        displayName: displayName ?? null,
        platform: input.platform,
        appVersion: input.appVersion,
        reportingTimezone: input.reportingTimezone,
      },
      update: {
        ...(displayName !== undefined ? { displayName } : {}),
        platform: input.platform,
        appVersion: input.appVersion,
        reportingTimezone: input.reportingTimezone,
      },
    });

    return toRecord(row);
  }

  async findByUserAndClientDeviceId(
    userId: string,
    clientDeviceId: string,
  ): Promise<SyncDeviceRecord | null> {
    const client = this.prisma.getClient();
    const row = await client.syncDevice.findUnique({
      where: {
        userId_clientDeviceId: {
          userId,
          clientDeviceId,
        },
      },
    });
    return row ? toRecord(row) : null;
  }

  async markSyncSuccess(input: {
    deviceId: string;
    syncedAt: Date;
    clientRevision: bigint;
  }): Promise<void> {
    const client = this.prisma.getClient();
    await client.syncDevice.update({
      where: { id: input.deviceId },
      data: {
        lastSyncAt: input.syncedAt,
        lastClientRevision: input.clientRevision,
      },
    });
  }
}

import {
  FilePurpose as PrismaFilePurpose,
  FileStatus as PrismaFileStatus,
  Prisma,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';
import type { Job } from 'bullmq';
import { withTransactionRetry } from '../../../../libs/platform/db/tx-retry';
import type { PrismaService } from '../../../../libs/platform/db/prisma.service';
import type { ObjectStorageService } from '../../../../libs/platform/storage/object-storage.service';
import type {
  UsersProfileImageDeleteStoredFileJobData,
  UsersProfileImageExpireUploadJobData,
} from '../../../../libs/features/users/infra/jobs/profile-image-cleanup.job';
import type { UsersFinalizeAccountDeletionJobData } from '../../../../libs/features/users/infra/jobs/user-account-deletion.job';
import { wipeUsageSyncForUser } from '../../../../libs/features/usage-sync/infra/persistence/wipe-usage-sync-for-user';
import type {
  UsersFinalizeDeletionTxnResult,
  UsersProfileImageDeleteStoredFileJobResult,
  UsersProfileImageExpireUploadJobResult,
} from './users-account-deletion.contracts';

export async function runFinalizeAccountDeletionTx(
  prisma: PrismaService,
  job: Job<UsersFinalizeAccountDeletionJobData>,
  now: Date,
): Promise<UsersFinalizeDeletionTxnResult> {
  const client = prisma.getClient();

  return await withTransactionRetry(
    client,
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: job.data.userId },
        select: {
          id: true,
          email: true,
          status: true,
          deletionRequestedAt: true,
          deletionScheduledFor: true,
          deletionRequestedSessionId: true,
          deletionRequestedTraceId: true,
          deletedAt: true,
        },
      });

      if (!user) {
        return { kind: 'skipped', reason: 'user_not_found' } as const;
      }

      if (user.status === PrismaUserStatus.DELETED || user.deletedAt !== null) {
        return { kind: 'skipped', reason: 'already_deleted', userId: user.id } as const;
      }

      const scheduledFor = user.deletionScheduledFor;
      if (!scheduledFor) {
        return { kind: 'skipped', reason: 'not_scheduled', userId: user.id } as const;
      }

      if (scheduledFor.getTime() > now.getTime()) {
        return {
          kind: 'not_due',
          userId: user.id,
          scheduledFor,
        } as const;
      }

      const traceId =
        user.deletionRequestedTraceId ?? (typeof job.id === 'string' ? `job:${job.id}` : 'unknown');
      const actorSessionId = user.deletionRequestedSessionId;
      if (!actorSessionId) {
        throw new Error('Invariant violated: missing deletionRequestedSessionId');
      }

      // Usage-sync is keyed by userId; soft-deleted User rows never cascade.
      // Hard-delete collect data before scrubbing credentials (same txn).
      // ADR 0020 / usage-sync Phase D wipe.
      const usageSyncWipe = await wipeUsageSyncForUser(tx, user.id);

      const scrubbedEmail = `deleted+${user.id}@example.invalid`;

      await tx.user.update({
        where: { id: user.id },
        data: {
          email: scrubbedEmail,
          emailVerifiedAt: null,
          status: PrismaUserStatus.DELETED,
          deletedAt: now,
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          deletionRequestedSessionId: null,
          deletionRequestedTraceId: null,
          suspendedAt: null,
          suspendedReason: null,
        },
        select: { id: true },
      });

      await tx.userProfile.updateMany({
        where: { userId: user.id },
        data: { displayName: null, givenName: null, familyName: null },
      });

      await tx.passwordCredential.deleteMany({ where: { userId: user.id } });
      await tx.externalIdentity.deleteMany({ where: { userId: user.id } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

      // Sessions contain device identifiers; drop them entirely.
      await tx.session.deleteMany({ where: { userId: user.id } });

      await tx.userAccountDeletionAudit.create({
        data: {
          actorUserId: user.id,
          actorSessionId,
          targetUserId: user.id,
          action: 'FINALIZED',
          traceId,
        },
        select: { id: true },
      });

      return { kind: 'finalized', userId: user.id, usageSyncWipe } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

export async function runDeleteProfileImageStoredFile(
  prisma: PrismaService,
  storage: ObjectStorageService,
  job: Job<UsersProfileImageDeleteStoredFileJobData>,
  now: Date,
): Promise<UsersProfileImageDeleteStoredFileJobResult> {
  const client = prisma.getClient();

  const file = await client.storedFile.findFirst({
    where: {
      id: job.data.fileId,
      ownerUserId: job.data.ownerUserId,
    },
    select: { id: true, purpose: true, status: true, objectKey: true },
  });

  if (!file) {
    return { ok: true, fileId: job.data.fileId, outcome: 'skipped', reason: 'file_not_found' };
  }

  if (file.purpose !== PrismaFilePurpose.PROFILE_IMAGE) {
    return {
      ok: true,
      fileId: file.id,
      outcome: 'skipped',
      reason: 'not_profile_image',
    };
  }

  if (!storage.isEnabled()) {
    return {
      ok: true,
      fileId: file.id,
      outcome: 'skipped',
      reason: 'storage_not_configured',
    };
  }

  await storage.deleteObject(file.objectKey);

  await client.storedFile.updateMany({
    where: {
      id: file.id,
      ownerUserId: job.data.ownerUserId,
      status: { not: PrismaFileStatus.DELETED },
    },
    data: { status: PrismaFileStatus.DELETED, deletedAt: now },
  });

  return { ok: true, fileId: file.id, outcome: 'deleted' };
}

export async function runExpireProfileImageUpload(
  prisma: PrismaService,
  storage: ObjectStorageService,
  job: Job<UsersProfileImageExpireUploadJobData>,
  now: Date,
): Promise<UsersProfileImageExpireUploadJobResult> {
  const client = prisma.getClient();

  const file = await client.storedFile.findFirst({
    where: {
      id: job.data.fileId,
      ownerUserId: job.data.ownerUserId,
    },
    select: { id: true, purpose: true, status: true, objectKey: true },
  });

  if (!file) {
    return { ok: true, fileId: job.data.fileId, outcome: 'skipped', reason: 'file_not_found' };
  }

  if (file.purpose !== PrismaFilePurpose.PROFILE_IMAGE) {
    return { ok: true, fileId: file.id, outcome: 'skipped', reason: 'not_profile_image' };
  }

  if (file.status !== PrismaFileStatus.UPLOADING) {
    return { ok: true, fileId: file.id, outcome: 'skipped', reason: 'not_uploading' };
  }

  const storageEnabled = storage.isEnabled();
  if (storageEnabled) {
    await storage.deleteObject(file.objectKey);
  }

  await client.storedFile.updateMany({
    where: {
      id: file.id,
      ownerUserId: job.data.ownerUserId,
      status: { not: PrismaFileStatus.DELETED },
    },
    data: { status: PrismaFileStatus.DELETED, deletedAt: now },
  });

  return {
    ok: true,
    fileId: file.id,
    outcome: 'expired',
    ...(storageEnabled ? {} : { reason: 'storage_not_configured' }),
  };
}

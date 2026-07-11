-- AlterEnum: add product upload-policy scopes (keep existing "rolling" for compatibility)
ALTER TYPE "SyncBatchScope" ADD VALUE 'full';
ALTER TYPE "SyncBatchScope" ADD VALUE 'incremental';

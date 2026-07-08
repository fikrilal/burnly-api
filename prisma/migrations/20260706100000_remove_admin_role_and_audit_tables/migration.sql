-- Drop admin/ops audit tables no longer used by the consumer API.
DROP TABLE IF EXISTS "UserRoleChangeAudit";
DROP TABLE IF EXISTS "UserStatusChangeAudit";

-- Remove persisted role assignment; all Burnly users are implicit consumers.
ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
DROP TYPE IF EXISTS "UserRole";

-- Remove the last-admin deletion enum variant.
DELETE FROM "UserAccountDeletionAudit" WHERE "action" = 'FINALIZE_BLOCKED_LAST_ADMIN';

CREATE TYPE "UserAccountDeletionAction_new" AS ENUM ('REQUESTED', 'CANCELED', 'FINALIZED');

ALTER TABLE "UserAccountDeletionAudit"
  ALTER COLUMN "action" TYPE "UserAccountDeletionAction_new"
  USING ("action"::text::"UserAccountDeletionAction_new");

DROP TYPE "UserAccountDeletionAction";
ALTER TYPE "UserAccountDeletionAction_new" RENAME TO "UserAccountDeletionAction";
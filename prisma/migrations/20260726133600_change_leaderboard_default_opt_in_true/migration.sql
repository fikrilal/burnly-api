-- AlterTable
ALTER TABLE "UserProfile" ALTER COLUMN "leaderboardOptIn" SET DEFAULT true,
ALTER COLUMN "leaderboardOptedInAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserProfile" ADD COLUMN "leaderboardOptedInAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "UserProfile_leaderboardOptIn_idx" ON "UserProfile"("leaderboardOptIn");

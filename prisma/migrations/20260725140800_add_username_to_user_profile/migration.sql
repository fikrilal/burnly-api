-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "username" VARCHAR(30);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_username_key" ON "UserProfile"("username");

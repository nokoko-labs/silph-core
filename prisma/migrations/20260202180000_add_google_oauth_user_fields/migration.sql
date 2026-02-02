-- AlterTable: make password nullable (OAuth-only users have no password)
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

-- AlterTable: add googleId for Google OAuth (unique, nullable)
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

-- CreateUniqueIndex for googleId (only one account per Google ID)
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

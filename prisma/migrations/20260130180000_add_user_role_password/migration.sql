-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- AlterTable: add password (required) with temporary default for existing rows
ALTER TABLE "users" ADD COLUMN "password" TEXT NOT NULL DEFAULT '';

-- AlterTable: add role with default
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';

-- AlterTable: drop name
ALTER TABLE "users" DROP COLUMN "name";

-- Backfill tenantId for any existing users with null tenantId (use first tenant if exists)
UPDATE "users" SET "tenantId" = (SELECT "id" FROM "tenants" LIMIT 1) WHERE "tenantId" IS NULL;

-- Remove users that still have null tenantId (no tenant exists)
DELETE FROM "users" WHERE "tenantId" IS NULL;

-- Make tenantId required
ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;

-- Drop default on password so new rows must supply it
ALTER TABLE "users" ALTER COLUMN "password" DROP DEFAULT;

-- Drop existing FK and recreate with ON DELETE CASCADE
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenantId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

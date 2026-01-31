-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- AlterTable: add password (required) with temporary default for existing rows
ALTER TABLE "users" ADD COLUMN "password" TEXT NOT NULL DEFAULT '';

-- AlterTable: add role with default
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';

-- AlterTable: drop name
ALTER TABLE "users" DROP COLUMN "name";

-- Fail if any users have null tenantId (manual remediation required)
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "users" WHERE "tenantId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % user(s) have tenantId IS NULL. Manually assign them to the correct tenant or delete them, then re-run the migration.', orphan_count;
  END IF;
END $$;

-- Make tenantId required
ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;

-- Drop default on password so new rows must supply it
ALTER TABLE "users" ALTER COLUMN "password" DROP DEFAULT;

-- Drop existing FK and recreate with ON DELETE CASCADE
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_tenantId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

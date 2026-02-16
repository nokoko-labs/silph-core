/*
  Warnings:

  - The `enabledAuthProviders` column on the `tenants` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "enabledAuthProviders",
ADD COLUMN     "enabledAuthProviders" TEXT[] DEFAULT ARRAY['password']::TEXT[];

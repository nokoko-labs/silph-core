-- Remove redundant social IDs from users; Account table is the source of truth for OAuth.
-- Each user can have multiple Account records (google, github, etc.) via the accounts relation.

-- Drop unique indexes on users (googleId, githubId)
DROP INDEX IF EXISTS "users_googleId_key";
DROP INDEX IF EXISTS "users_githubId_key";

-- Drop columns from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "googleId";
ALTER TABLE "users" DROP COLUMN IF EXISTS "githubId";
ALTER TABLE "users" DROP COLUMN IF EXISTS "provider";

-- Drop old unique constraint on accounts (provider, providerAccountId)
-- Allows same OAuth identity to link to multiple users (different tenants)
DROP INDEX IF EXISTS "accounts_provider_providerAccountId_key";

-- Add new unique constraint: each user can have at most one account per provider
CREATE UNIQUE INDEX "accounts_userId_provider_key" ON "accounts"("userId", "provider");

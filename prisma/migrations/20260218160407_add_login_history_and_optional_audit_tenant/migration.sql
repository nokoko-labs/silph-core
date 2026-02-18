-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "tenantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "login_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

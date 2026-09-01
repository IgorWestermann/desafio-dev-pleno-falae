-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3);

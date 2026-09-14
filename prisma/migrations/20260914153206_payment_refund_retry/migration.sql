-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "lastRefundTriedAt" TIMESTAMP(3),
ADD COLUMN     "refundAttemptCount" INTEGER NOT NULL DEFAULT 0;

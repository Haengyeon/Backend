-- DropIndex
DROP INDEX "PointTransaction_pointAccountId_createdAt_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDummy" BOOLEAN NOT NULL DEFAULT false;

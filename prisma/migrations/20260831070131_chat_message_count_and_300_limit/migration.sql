/*
  Warnings:

  - You are about to drop the column `regionContributionAmount` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the `ChatMessageQuota` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MessageExtensionPayment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ChatMessageQuota" DROP CONSTRAINT "ChatMessageQuota_chatRoomId_fkey";

-- DropForeignKey
ALTER TABLE "ChatMessageQuota" DROP CONSTRAINT "ChatMessageQuota_userId_fkey";

-- DropForeignKey
ALTER TABLE "MessageExtensionPayment" DROP CONSTRAINT "MessageExtensionPayment_chatRoomId_fkey";

-- DropForeignKey
ALTER TABLE "MessageExtensionPayment" DROP CONSTRAINT "MessageExtensionPayment_userId_fkey";

-- AlterTable
ALTER TABLE "ChatMessage" ALTER COLUMN "content" SET DATA TYPE VARCHAR(300);

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "regionContributionAmount";

-- DropTable
DROP TABLE "ChatMessageQuota";

-- DropTable
DROP TABLE "MessageExtensionPayment";

-- CreateTable
CREATE TABLE "ChatMessageCount" (
    "id" TEXT NOT NULL,
    "chatRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatMessageCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageCount_chatRoomId_userId_key" ON "ChatMessageCount"("chatRoomId", "userId");

-- AddForeignKey
ALTER TABLE "ChatMessageCount" ADD CONSTRAINT "ChatMessageCount_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageCount" ADD CONSTRAINT "ChatMessageCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

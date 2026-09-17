/*
  Warnings:

  - You are about to drop the column `attemptcount` on the `CourseVideo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CourseVideo" DROP COLUMN "attemptcount",
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0;

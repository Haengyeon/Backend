/*
  Warnings:

  - You are about to drop the column `attemptcount` on the `CourseVideo` table. All the data in the column will be lost.

*/
-- AlterTable
-- 운영엔 attemptCount가 이미 있다(20260917175000). 새 DB에선 원래대로 동작
ALTER TABLE "CourseVideo" DROP COLUMN IF EXISTS "attemptcount",
ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
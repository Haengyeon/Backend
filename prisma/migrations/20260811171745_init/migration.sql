/*
  Warnings:

  - You are about to alter the column `thumbnailUrl` on the `Course` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to drop the column `sessionId` on the `CourseMissionPhoto` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `CourseReview` table. All the data in the column will be lost.
  - You are about to alter the column `imageUrl` on the `CourseSpot` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to drop the column `sessionId` on the `CourseVideo` table. All the data in the column will be lost.
  - You are about to alter the column `videoUrl` on the `CourseVideo` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `thumbnailUrl` on the `CourseVideo` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to drop the column `courseSessionId` on the `PointTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `introduction` on the `Profile` table. All the data in the column will be lost.
  - You are about to drop the column `courseSessionId` on the `Stamp` table. All the data in the column will be lost.
  - You are about to drop the `CourseSession` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[matchAttemptId]` on the table `Course` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[missionId,userId]` on the table `CourseMissionPhoto` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId,userId]` on the table `CourseReview` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId]` on the table `CourseVideo` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `matchAttemptId` to the `Course` table without a default value. This is not possible if the table is not empty.
  - Added the required column `travelDate` to the `Course` table without a default value. This is not possible if the table is not empty.
  - Added the required column `courseId` to the `CourseReview` table without a default value. This is not possible if the table is not empty.
  - Added the required column `courseId` to the `CourseVideo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `introduce` to the `Profile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `courseId` to the `Stamp` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "CourseMissionPhoto" DROP CONSTRAINT "CourseMissionPhoto_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "CourseReview" DROP CONSTRAINT "CourseReview_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "CourseSession" DROP CONSTRAINT "CourseSession_courseId_fkey";

-- DropForeignKey
ALTER TABLE "CourseSession" DROP CONSTRAINT "CourseSession_matchAttemptId_fkey";

-- DropForeignKey
ALTER TABLE "CourseVideo" DROP CONSTRAINT "CourseVideo_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "PointTransaction" DROP CONSTRAINT "PointTransaction_courseSessionId_fkey";

-- DropForeignKey
ALTER TABLE "Stamp" DROP CONSTRAINT "Stamp_courseSessionId_fkey";

-- DropIndex
DROP INDEX "CourseMissionPhoto_sessionId_missionId_userId_key";

-- DropIndex
DROP INDEX "CourseReview_sessionId_userId_key";

-- DropIndex
DROP INDEX "CourseVideo_sessionId_key";

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "matchAttemptId" TEXT NOT NULL,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CourseStatus" NOT NULL DEFAULT 'UPCOMING',
ADD COLUMN     "travelDate" DATE NOT NULL,
ALTER COLUMN "thumbnailUrl" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "CourseMissionPhoto" DROP COLUMN "sessionId";

-- AlterTable
ALTER TABLE "CourseReview" DROP COLUMN "sessionId",
ADD COLUMN     "courseId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CourseSpot" ADD COLUMN     "moveMinutesFromPrevious" INTEGER,
ADD COLUMN     "stayMinutes" INTEGER,
ALTER COLUMN "imageUrl" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "CourseVideo" DROP COLUMN "sessionId",
ADD COLUMN     "courseId" TEXT NOT NULL,
ALTER COLUMN "videoUrl" SET DATA TYPE VARCHAR(500),
ALTER COLUMN "thumbnailUrl" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "PointTransaction" DROP COLUMN "courseSessionId",
ADD COLUMN     "courseId" TEXT;

-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "introduction",
ADD COLUMN     "introduce" VARCHAR(100) NOT NULL;

-- AlterTable
ALTER TABLE "Stamp" DROP COLUMN "courseSessionId",
ADD COLUMN     "courseId" TEXT NOT NULL;

-- DropTable
DROP TABLE "CourseSession";

-- DropEnum
DROP TYPE "CourseSessionStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Course_matchAttemptId_key" ON "Course"("matchAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMissionPhoto_missionId_userId_key" ON "CourseMissionPhoto"("missionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReview_courseId_userId_key" ON "CourseReview"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseVideo_courseId_key" ON "CourseVideo"("courseId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_matchAttemptId_fkey" FOREIGN KEY ("matchAttemptId") REFERENCES "MatchAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseVideo" ADD CONSTRAINT "CourseVideo_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stamp" ADD CONSTRAINT "Stamp_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

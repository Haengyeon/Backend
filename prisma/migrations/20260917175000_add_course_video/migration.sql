-- AlterTable
ALTER TABLE "CourseVideo" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorMessage" VARCHAR(200);

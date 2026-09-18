-- AlterTable
ALTER TABLE "CourseVideo" ADD COLUMN     "attemptcount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorMessage" VARCHAR(200);
